// Offensive Combat — produção e homologação locais (Docker) expostas pelo
// Cloudflare Tunnel. Irmão do TrybestTunel.exe da TryBest, no mesmo modelo.
//
// O .exe NÃO roda o jogo: ele prepara e sobe as pilhas `offensive-prd`
// (docker-compose.prd.yml: offensive-combat.trybest.com.br e
// games.trybest.com.br) e `offensive-hml` (docker-compose.hml.yml:
// offensive-combat-hml.trybest.com.br) e fica na bandeja vigiando. Servidor,
// nginx, banco, Redis e cloudflared rodam em containers — nada do jogo roda com
// o seu usuário do Windows, e nenhuma porta é publicada no host.
//
// Versões: a produção roda uma versão FINAL (tag alpha-0.0.2, da main) e a
// homologação uma rc (alpha-0.1.0.rc.003, da homolog) ou, sem rc mais nova, a
// final — as tags nascem no
// workflow .github/workflows/release.yml. A cada 10 min o .exe olha as tags com
// `git ls-remote --tags`; versão nova vira aviso e item no menu — nada muda sem
// o clique (ou sem um pedido pela API).
//
// - Atualizar: build da tag → backup (pg_dump) → sobe; as migrations rodam
//   sozinhas quando o servidor sobe (server/db.ts) → confere o /api/saude.
// - Voltar: backup → roda os .down.sql das migrations que a versão de destino
//   não tinha, numa transação só → sobe as imagens dela.
//
// Homologação sob demanda: "Ligar/Desligar homologação" na bandeja; a escolha
// fica em <HML_DIR>\ligada.txt e vale para as próximas subidas.
//
// Deploy remoto (CI/CD): POST /api/deploy, com X-Deploy-Key, só ENFILEIRA o
// pedido no Redis da pilha (server/deploy.ts). Este .exe lê `deploy:fila` de
// cada pilha no ar a cada ~15 s, executa o mesmo Atualizar/Voltar e escreve o
// andamento no pedido. Atualizar pela API que não responde a versão nova no
// /api/saude volta sozinho. A chave nasce em "Gerar chave de deploy…" e o
// jogo só recebe o hash (DEPLOY_KEY_HASH no .env.prd/.env.hml).
//
// Compilar: deploy\local\compilar.ps1 (csc do .NET Framework, já vem no Windows).
// Configurar: tunel.ini ao lado do .exe.
//
// Uso:
//   OffensiveTunel.exe               sobe a produção; ícone na bandeja
//   OffensiveTunel.exe --parar       para as pilhas e o .exe
//   OffensiveTunel.exe --instalar    sobe junto com o login do Windows
//   OffensiveTunel.exe --desinstalar tira do login
//
// ⚠️ C# 5 de propósito (é o que o csc do .NET Framework compila): sem `$""`,
// `?.` nem `nameof`.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OffensiveTunel
{
    static class Programa
    {
        const string NomeDoMutex = "Local\\OffensiveTunel";
        const string NomeDoEventoParar = "Local\\OffensiveTunel_Parar";
        const string ChaveRun = @"Software\Microsoft\Windows\CurrentVersion\Run";

        [STAThread]
        static int Main(string[] args)
        {
            string acao = args.Length > 0 ? args[0].ToLowerInvariant() : "";
            if (acao == "--parar") return Parar();
            if (acao == "--instalar") return Instalar(true);
            if (acao == "--desinstalar") return Instalar(false);

            bool criado;
            using (var mutex = new Mutex(true, NomeDoMutex, out criado))
            {
                if (!criado)
                {
                    MessageBox.Show("O Offensive Combat já está rodando (ícone na bandeja).",
                        "Offensive Combat", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                Application.EnableVisualStyles();
                var app = new Supervisor(Path.GetDirectoryName(Application.ExecutablePath));
                Application.Run(app);
                return app.CodigoDeSaida;
            }
        }

        static int Parar()
        {
            EventWaitHandle evento;
            if (!EventWaitHandle.TryOpenExisting(NomeDoEventoParar, out evento)) return 0;
            evento.Set();
            return 0;
        }

        static int Instalar(bool ligar)
        {
            using (var chave = Registry.CurrentUser.OpenSubKey(ChaveRun, true))
            {
                if (ligar) chave.SetValue("OffensiveTunel", "\"" + Application.ExecutablePath + "\"");
                else chave.DeleteValue("OffensiveTunel", false);
            }
            MessageBox.Show(ligar
                    ? "O Offensive Combat vai subir junto com o login do Windows."
                    : "O Offensive Combat não sobe mais com o login.",
                "Offensive Combat", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        public static EventWaitHandle CriarEventoParar()
        {
            return new EventWaitHandle(false, EventResetMode.ManualReset, NomeDoEventoParar);
        }
    }

    /// <summary>Arquivo CHAVE=valor (tunel.ini e .env). `#` comenta.</summary>
    class Chaves
    {
        readonly Dictionary<string, string> _v = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public Chaves(string caminho)
        {
            foreach (var bruta in File.ReadAllLines(caminho, Encoding.UTF8))
            {
                var linha = bruta.Trim();
                if (linha.Length == 0 || linha.StartsWith("#")) continue;
                int i = linha.IndexOf('=');
                if (i > 0) _v[linha.Substring(0, i).Trim()] = linha.Substring(i + 1).Trim();
            }
        }

        public string Texto(string chave, string padrao)
        {
            string v;
            return _v.TryGetValue(chave, out v) && v.Length > 0 ? v : padrao;
        }
    }

    /// <summary>
    /// Nome de versão no formato das tags (scripts/versao.py):
    /// final `alpha-0.0.2` (ou `1.0.0`, sem fase) e rc `alpha-0.1.0.rc.003`.
    /// </summary>
    class Versao : IComparable<Versao>
    {
        static readonly Regex Final = new Regex(@"^(?:(alpha|beta)-)?(\d+)\.(\d+)\.(\d+)$");
        static readonly Regex Rc = new Regex(@"^(.+)\.rc\.(\d{3})$");

        public string Nome;
        public int X, Y, Z;
        public int NumeroRc; // 0 = versão final

        public bool EhRc { get { return NumeroRc > 0; } }

        public static Versao Ler(string tag)
        {
            if (string.IsNullOrEmpty(tag)) return null;
            tag = tag.Trim();
            int rc = 0;
            string alvo = tag;
            var m = Rc.Match(tag);
            if (m.Success)
            {
                alvo = m.Groups[1].Value;
                rc = int.Parse(m.Groups[2].Value);
                if (rc == 0) return null;
            }
            var f = Final.Match(alvo);
            if (!f.Success) return null;
            return new Versao
            {
                Nome = tag,
                X = int.Parse(f.Groups[2].Value),
                Y = int.Parse(f.Groups[3].Value),
                Z = int.Parse(f.Groups[4].Value),
                NumeroRc = rc,
            };
        }

        /// <summary>Pelo número; a rc vem antes da final do mesmo número.</summary>
        public int CompareTo(Versao o)
        {
            if (o == null) return 1;
            int c = X.CompareTo(o.X);
            if (c == 0) c = Y.CompareTo(o.Y);
            if (c == 0) c = Z.CompareTo(o.Z);
            if (c == 0) c = (EhRc ? NumeroRc : int.MaxValue).CompareTo(o.EhRc ? o.NumeroRc : int.MaxValue);
            return c;
        }

        public override string ToString() { return Nome; }
    }

    /// <summary>
    /// Uma versão que esteve no ar. `migracoes` = as linhas de schema_migrations
    /// com ela no ar: o Voltar desfaz as que a versão de destino não tinha.
    /// </summary>
    class Implantacao
    {
        public string versao { get; set; }
        public string data { get; set; }
        public List<string> migracoes { get; set; }
        public string backup { get; set; }
    }

    /// <summary>Registro do que foi feito (atualizar, voltar), para auditoria.</summary>
    class Evento
    {
        public string acao { get; set; }
        public string de { get; set; }
        public string para { get; set; }
        public string data { get; set; }
        public string backup { get; set; }
    }

    /// <summary>
    /// historico.json do ambiente. `implantacoes` é uma pilha: Atualizar
    /// empilha, Voltar desempilha — o topo é a versão no ar.
    /// </summary>
    class Historico
    {
        public List<Implantacao> implantacoes { get; set; }
        public List<Evento> registro { get; set; }

        public Historico()
        {
            implantacoes = new List<Implantacao>();
            registro = new List<Evento>();
        }

        [ScriptIgnore]
        public Implantacao Atual
        {
            get { return implantacoes.Count > 0 ? implantacoes[implantacoes.Count - 1] : null; }
        }

        [ScriptIgnore]
        public Implantacao Anterior
        {
            get { return implantacoes.Count > 1 ? implantacoes[implantacoes.Count - 2] : null; }
        }

        public static Historico Ler(string caminho)
        {
            if (!File.Exists(caminho)) return new Historico();
            var h = new JavaScriptSerializer().Deserialize<Historico>(File.ReadAllText(caminho, Encoding.UTF8));
            if (h == null) h = new Historico();
            if (h.implantacoes == null) h.implantacoes = new List<Implantacao>();
            if (h.registro == null) h.registro = new List<Evento>();
            foreach (var i in h.implantacoes) if (i.migracoes == null) i.migracoes = new List<string>();
            return h;
        }

        /// <summary>Grava num temporário e troca: queda no meio não corrompe o arquivo.</summary>
        public void Salvar(string caminho)
        {
            var tmp = caminho + ".tmp";
            File.WriteAllText(tmp, new JavaScriptSerializer().Serialize(this), new UTF8Encoding(false));
            if (File.Exists(caminho)) File.Replace(tmp, caminho, null);
            else File.Move(tmp, caminho);
        }
    }

    /// <summary>Produção ou homologação: a mesma máquina, pilhas separadas.</summary>
    class Ambiente
    {
        public string Nome;          // "Produção"
        public string Rotulo;        // "produção" (no meio da frase)
        public string Pilha;         // offensive-prd
        public string Pasta;         // %USERPROFILE%\.offensive-prd
        public string VarPasta;      // PRD_DIR (o compose lê)
        public string ArquivoEnv;    // <Pasta>\.env.prd
        public string Compose;       // docker-compose.prd.yml
        public string Url;           // https://offensive-combat.trybest.com.br
        public bool Rc;              // homologação recebe rc; produção, só final
        public bool Pronto;          // configurado e com portões ok
        public bool NoAr;            // a pilha foi subida por este .exe
        public string Motivo = "";   // por que não está pronto
        public string VersaoNoAr;    // o que está rodando (null = nada)
        public Versao Disponivel;    // versão nova oferecida no menu
        public string Avisada = "";  // última versão avisada em balão
        public Historico Historico = new Historico();
        public ToolStripMenuItem ItemTitulo, ItemAtualizar, ItemVoltar, ItemLigar;

        public string CaminhoHistorico { get { return Path.Combine(Pasta, "historico.json"); } }
        public string PastaBackups { get { return Path.Combine(Pasta, "backups"); } }
        public string Contexto { get { return Path.Combine(Pasta, @"fonte\jogo"); } }
        string CaminhoLigada { get { return Path.Combine(Pasta, "ligada.txt"); } }

        /// <summary>A escolha de "Ligar/Desligar" (null = nunca escolhida).</summary>
        public bool? Preferencia
        {
            get
            {
                if (!File.Exists(CaminhoLigada)) return null;
                return File.ReadAllText(CaminhoLigada).Trim() == "sim";
            }
            set
            {
                Directory.CreateDirectory(Pasta);
                File.WriteAllText(CaminhoLigada, value == true ? "sim" : "nao", new UTF8Encoding(false));
            }
        }

        /// <summary>A produção só recebe versão final; a homologação, rc ou final.</summary>
        public bool Aceita(Versao v) { return v != null && (Rc || !v.EhRc); }
    }

    /// <summary>
    /// Job do Windows com "matar ao fechar": se este .exe morrer, os processos
    /// que ele abriu (docker compose, o seguidor de logs) morrem junto. Os
    /// CONTAINERS não — esses o Docker mantém, com `restart: unless-stopped`.
    /// </summary>
    class Job : IDisposable
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObject(IntPtr a, string nome);

        [DllImport("kernel32.dll")]
        static extern bool SetInformationJobObject(IntPtr job, int classe, IntPtr info, uint tamanho);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool AssignProcessToJobObject(IntPtr job, IntPtr processo);

        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr h);

        [StructLayout(LayoutKind.Sequential)]
        struct BasicLimit
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IoCounters { public ulong A, B, C, D, E, F; }

        [StructLayout(LayoutKind.Sequential)]
        struct ExtendedLimit
        {
            public BasicLimit Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        readonly IntPtr _h;

        public Job()
        {
            _h = CreateJobObject(IntPtr.Zero, null);
            var info = new ExtendedLimit();
            info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            int tamanho = Marshal.SizeOf(typeof(ExtendedLimit));
            IntPtr p = Marshal.AllocHGlobal(tamanho);
            try
            {
                Marshal.StructureToPtr(info, p, false);
                SetInformationJobObject(_h, 9, p, (uint)tamanho);
            }
            finally { Marshal.FreeHGlobal(p); }
        }

        public void Adicionar(Process p) { AssignProcessToJobObject(_h, p.Handle); }

        public void Dispose() { CloseHandle(_h); }
    }

    class Log
    {
        const long Limite = 10 * 1024 * 1024;
        readonly string _pasta;
        readonly object _trava = new object();

        public Log(string pasta)
        {
            _pasta = pasta;
            Directory.CreateDirectory(pasta);
        }

        public string Pasta { get { return _pasta; } }

        public void Info(string msg) { Escrever("tunel", msg); }

        public void Escrever(string arquivo, string texto)
        {
            lock (_trava)
            {
                try
                {
                    var caminho = Path.Combine(_pasta, arquivo + ".log");
                    var fi = new FileInfo(caminho);
                    if (fi.Exists && fi.Length > Limite)
                    {
                        if (File.Exists(caminho + ".1")) File.Delete(caminho + ".1");
                        File.Move(caminho, caminho + ".1");
                    }
                    File.AppendAllText(caminho,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + texto + Environment.NewLine,
                        Encoding.UTF8);
                }
                catch (IOException) { }
            }
        }
    }

    class Supervisor : ApplicationContext
    {
        // Serviços que precisam estar de pé para o jogo (e a lista de jogos) funcionar.
        static readonly string[] Essenciais = { "banco", "redis", "jogo", "web", "portal", "cloudflared" };
        static readonly Regex VersaoNaSaude = new Regex("\"version\"\\s*:\\s*\"([^\"]*)\"");
        // Nome de migration de server/migrations (o que vai no schema_migrations).
        static readonly Regex NomeDeMigracao = new Regex(@"^\d+_[A-Za-z0-9_]+\.sql$");
        static readonly Regex IdDePedido = new Regex("^[0-9a-f]{32}$");

        readonly string _pasta;
        readonly Log _log;
        readonly Job _job = new Job();
        readonly NotifyIcon _icone;
        readonly Control _tela = new Control();
        readonly EventWaitHandle _parar = Programa.CriarEventoParar();
        readonly EventWaitHandle _verificarJa = new EventWaitHandle(false, EventResetMode.AutoReset);
        readonly object _travaOperacao = new object();
        readonly Ambiente _prd = new Ambiente();
        readonly Ambiente _hml = new Ambiente();
        string _docker = "docker";
        string _jogo = "";
        string _versaoInicial = "";
        string _dominio = "", _emailAdmin = "";
        int _minutosEntreVerificacoes = 10;
        Process _seguidorDeLogs;
        volatile bool _ocupado;
        volatile string _operacaoRemota; // id do pedido de deploy em execução
        bool _subiu;
        public int CodigoDeSaida;

        public Supervisor(string pasta)
        {
            _pasta = pasta;
            _log = new Log(Path.Combine(pasta, "logs"));
            var forcar = _tela.Handle; // cria a janela agora, na thread da tela

            _prd.Nome = "Produção"; _prd.Rotulo = "produção"; _prd.Pilha = "offensive-prd";
            _prd.VarPasta = "PRD_DIR"; _prd.Rc = false;
            _hml.Nome = "Homologação"; _hml.Rotulo = "homologação"; _hml.Pilha = "offensive-hml";
            _hml.VarPasta = "HML_DIR"; _hml.Rc = true;

            var menu = new ContextMenuStrip();
            foreach (var a in new[] { _prd, _hml })
            {
                var amb = a;
                amb.ItemTitulo = new ToolStripMenuItem(amb.Nome + ": …");
                amb.ItemTitulo.Click += delegate { if (amb.NoAr && amb.Url != null) Process.Start(amb.Url); };
                amb.ItemAtualizar = new ToolStripMenuItem("Atualizar " + amb.Rotulo) { Visible = false };
                amb.ItemAtualizar.Click += delegate { PedirAtualizar(amb); };
                amb.ItemVoltar = new ToolStripMenuItem("Voltar " + amb.Rotulo) { Visible = false };
                amb.ItemVoltar.Click += delegate { PedirVoltar(amb); };
                menu.Items.Add(amb.ItemTitulo);
                menu.Items.Add(amb.ItemAtualizar);
                menu.Items.Add(amb.ItemVoltar);
                if (amb == _hml)
                {
                    amb.ItemLigar = new ToolStripMenuItem("Ligar homologação");
                    amb.ItemLigar.Click += delegate { PedirLigarOuDesligar(); };
                    menu.Items.Add(amb.ItemLigar);
                }
                menu.Items.Add(new ToolStripSeparator());
            }
            menu.Items.Add("Gerar chave de deploy…", null, delegate { PedirChaveDeDeploy(); });
            menu.Items.Add("Procurar versão nova agora", null, delegate { _verificarJa.Set(); });
            menu.Items.Add("Abrir a lista de jogos", null, delegate { if (_dominio.Length > 0) Process.Start("https://games." + _dominio); });
            menu.Items.Add("Abrir os logs", null, delegate { Process.Start("explorer.exe", "\"" + _log.Pasta + "\""); });
            menu.Items.Add("Abrir os backups", null, delegate
            {
                Directory.CreateDirectory(_prd.PastaBackups);
                Process.Start("explorer.exe", "\"" + _prd.PastaBackups + "\"");
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Parar o Offensive Combat", null, delegate { _parar.Set(); });
            _icone = new NotifyIcon
            {
                // O ícone embutido no .exe (`/win32icon`, a mira do public/icon.svg).
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application,
                Text = "Offensive Combat — subindo…",
                ContextMenuStrip = menu,
                Visible = true,
            };
            _icone.BalloonTipClicked += delegate { menu.Show(Cursor.Position); };

            var t = new Thread(Rodar) { IsBackground = true, Name = "supervisor" };
            t.Start();
        }

        // ── Tela ─────────────────────────────────────────────────────────────

        /// <summary>Menu só se mexe na thread da tela.</summary>
        void NaTela(MethodInvoker acao)
        {
            if (_tela.InvokeRequired) _tela.BeginInvoke(acao);
            else acao();
        }

        void Status(string texto)
        {
            var t = "Offensive Combat — " + texto;
            _icone.Text = t.Length > 63 ? t.Substring(0, 63) : t; // limite do NotifyIcon
            _log.Info(texto);
        }

        void Recusar(string motivo)
        {
            _log.Info("RECUSADO: " + motivo);
            MessageBox.Show(motivo, "Offensive Combat — não subiu", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            CodigoDeSaida = 1;
        }

        void Avisar(string titulo, string texto, ToolTipIcon tipo)
        {
            _log.Info(titulo + ": " + texto.Replace("\n", " "));
            _icone.ShowBalloonTip(8000, titulo, texto, tipo);
        }

        /// <summary>Título, Atualizar, Voltar e Ligar de cada ambiente.</summary>
        void AtualizarMenu()
        {
            NaTela(delegate
            {
                foreach (var a in new[] { _prd, _hml })
                {
                    string estado;
                    if (!a.Pronto) estado = a.Motivo.Length > 0 ? a.Motivo : "não configurada";
                    else if (a.ItemLigar != null && !a.NoAr)
                        estado = "desligada" + (a.Historico.Atual != null ? " (" + a.Historico.Atual.versao + ")" : "");
                    else if (a.VersaoNoAr == null) estado = "sem versão";
                    else estado = a.VersaoNoAr;
                    a.ItemTitulo.Text = a.Nome + ": " + estado;
                    a.ItemTitulo.Enabled = a.NoAr;

                    a.ItemAtualizar.Visible = a.Pronto && a.Disponivel != null;
                    a.ItemAtualizar.Enabled = !_ocupado;
                    if (a.Disponivel != null)
                        a.ItemAtualizar.Text = "Atualizar " + a.Rotulo + " para " + a.Disponivel.Nome;

                    var anterior = a.Historico.Anterior;
                    a.ItemVoltar.Visible = a.Pronto && a.VersaoNoAr != null && anterior != null;
                    a.ItemVoltar.Enabled = !_ocupado;
                    if (anterior != null) a.ItemVoltar.Text = "Voltar " + a.Rotulo + " para " + anterior.versao;

                    if (a.ItemLigar != null)
                    {
                        a.ItemLigar.Text = a.NoAr ? "Desligar " + a.Rotulo : "Ligar " + a.Rotulo;
                        a.ItemLigar.Enabled = !_ocupado;
                        // Desligada, Atualizar/Voltar somem: ligar vem primeiro.
                        if (!a.NoAr) { a.ItemAtualizar.Visible = false; a.ItemVoltar.Visible = false; }
                    }
                }
            });
        }

        // ── Ciclo de vida ────────────────────────────────────────────────────

        void Rodar()
        {
            try
            {
                if (Subir()) Vigiar();
            }
            catch (Exception e)
            {
                Recusar("Erro inesperado: " + e.Message + "\n\nDetalhes em logs\\tunel.log.");
                _log.Info(e.ToString());
            }
            Encerrar();
        }

        bool Subir()
        {
            var ini = Path.Combine(_pasta, "tunel.ini");
            if (!File.Exists(ini))
            {
                Recusar("Falta o tunel.ini ao lado do .exe.\nCopie o tunel.example.ini e ajuste.");
                return false;
            }
            var cfg = new Chaves(ini);
            var perfil = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            _jogo = cfg.Texto("JOGO_DIR", "");
            _versaoInicial = cfg.Texto("VERSAO_INICIAL", "");
            _dominio = cfg.Texto("DOMINIO", "trybest.com.br");
            _emailAdmin = cfg.Texto("ADMIN_EMAIL", "");
            _docker = cfg.Texto("DOCKER", "docker");
            int minutos;
            if (int.TryParse(cfg.Texto("VERIFICAR_MINUTOS", "10"), out minutos) && minutos > 0)
                _minutosEntreVerificacoes = minutos;
            if (_jogo.Length == 0 || !Directory.Exists(Path.Combine(_jogo, ".git")))
            {
                Recusar("JOGO_DIR no tunel.ini precisa apontar para o clone do offensive-combat-reload.");
                return false;
            }

            _prd.Pasta = cfg.Texto("PRD_DIR", Path.Combine(perfil, ".offensive-prd"));
            _prd.ArquivoEnv = Path.Combine(_prd.Pasta, ".env.prd");
            _prd.Compose = Path.Combine(_pasta, "docker-compose.prd.yml");
            _prd.Url = "https://offensive-combat." + _dominio;
            _hml.Pasta = cfg.Texto("HML_DIR", Path.Combine(perfil, ".offensive-hml"));
            _hml.ArquivoEnv = Path.Combine(_hml.Pasta, ".env.hml");
            _hml.Compose = Path.Combine(_pasta, "docker-compose.hml.yml");
            _hml.Url = "https://offensive-combat-hml." + _dominio;

            // ── Produção: portões — nada sobe com configuração insegura ──────
            Directory.CreateDirectory(_prd.Pasta);
            if (!File.Exists(_prd.ArquivoEnv))
            {
                File.WriteAllText(_prd.ArquivoEnv, GerarEnv(false), new UTF8Encoding(false));
                _log.Info("gerado " + _prd.ArquivoEnv + " com segredos novos");
            }
            string falha = Portoes(_prd);
            if (falha != null)
            {
                Recusar(falha);
                return false;
            }
            _prd.Pronto = true;
            _prd.Historico = Historico.Ler(_prd.CaminhoHistorico);

            // ── Homologação: opcional; um problema nela nunca derruba a produção.
            PrepararHomologacao();
            AtualizarMenu();

            // ── Docker ────────────────────────────────────────────────────────
            Status("esperando o Docker…");
            if (!EsperarDocker())
            {
                Recusar("O Docker não respondeu em 5 min. Abra o Docker Desktop e tente de novo.");
                return false;
            }

            // ── Produção ─────────────────────────────────────────────────────
            if (!SubirProducao()) return false;
            SeguirLogs();
            _subiu = true;
            Status("no ar: " + _prd.VersaoNoAr);
            AtualizarMenu();
            _icone.ShowBalloonTip(4000, "Offensive Combat no ar — " + _prd.VersaoNoAr,
                _prd.Url + "\nhttps://games." + _dominio, ToolTipIcon.Info);

            // ── Homologação: a escolha da bandeja (sem escolha: desligada).
            if (_hml.Pronto && _hml.Historico.Atual != null && _hml.Preferencia == true)
            {
                try { SubirNaVersao(_hml, _hml.Historico.Atual.versao, false); }
                catch (Exception e)
                {
                    _log.Info(e.ToString());
                    Avisar("Homologação não subiu", e.Message, ToolTipIcon.Warning);
                }
                AtualizarMenu();
            }
            PublicarEstado();
            return true;
        }

        /// <summary>Portões de um ambiente. Devolve o motivo da recusa, ou null.</summary>
        string Portoes(Ambiente a)
        {
            var env = new Chaves(a.ArquivoEnv);
            foreach (var k in new[] { "PG_SENHA", "REDIS_PASSWORD", "DATABASE_URL", "REDIS_URL" })
                if (env.Texto(k, "").Length == 0) return "Falta " + k + " no " + a.ArquivoEnv + ".";
            if (env.Texto("ADMIN_BOOTSTRAP_EMAIL", "").Length == 0)
                return "Falta ADMIN_BOOTSTRAP_EMAIL no " + a.ArquivoEnv + " (sem ele o jogo cria o admin padrão de desenvolvimento).";
            if (SenhaFraca(env.Texto("ADMIN_BOOTSTRAP_PASSWORD", "")))
                return "ADMIN_BOOTSTRAP_PASSWORD no " + a.ArquivoEnv + " é fraca.\nUse 8+ caracteres com letra e número.";
            foreach (var necessario in new[] { "cloudflared.yml", "credentials.json" })
            {
                if (!File.Exists(Path.Combine(a.Pasta, necessario)))
                    return "Falta " + necessario + " em " + a.Pasta + ".\n" +
                           "Rode uma vez o deploy\\local\\configurar-cloudflare.ps1" +
                           (a.Rc ? " -Homologacao." : ".");
            }
            return null;
        }

        void PrepararHomologacao()
        {
            _hml.Motivo = "";
            bool configurada = File.Exists(Path.Combine(_hml.Pasta, "cloudflared.yml"))
                               && File.Exists(Path.Combine(_hml.Pasta, "credentials.json"));
            if (!configurada)
            {
                _hml.Motivo = "não configurada";
                return;
            }
            if (!File.Exists(_hml.ArquivoEnv))
            {
                File.WriteAllText(_hml.ArquivoEnv, GerarEnv(true), new UTF8Encoding(false));
                _log.Info("gerado " + _hml.ArquivoEnv + " com segredos novos");
            }
            string falha = Portoes(_hml);
            if (falha != null)
            {
                _hml.Motivo = "configuração incompleta";
                Avisar("Homologação desligada", falha, ToolTipIcon.Warning);
                return;
            }
            _hml.Pronto = true;
            _hml.Historico = Historico.Ler(_hml.CaminhoHistorico);
        }

        /// <summary>
        /// Sobe a produção na versão do histórico (nunca numa mais nova sem o
        /// clique); sem histórico, na VERSAO_INICIAL do tunel.ini ou na última
        /// versão final.
        /// </summary>
        bool SubirProducao()
        {
            string versao = _prd.Historico.Atual != null ? _prd.Historico.Atual.versao : null;
            if (versao == null)
            {
                BuscarTags();
                versao = _versaoInicial.Length > 0 ? _versaoInicial : UltimaFinalLocal();
                if (versao == null || Versao.Ler(versao) == null || Versao.Ler(versao).EhRc)
                {
                    Recusar("Nenhuma versão final para subir (tag como alpha-0.0.1 no repositório).\n\n" +
                            "O workflow release cria a tag a cada push na main; ou ajuste VERSAO_INICIAL no tunel.ini.");
                    return false;
                }
            }
            try
            {
                SubirNaVersao(_prd, versao, _prd.Historico.Atual == null);
            }
            catch (Exception e)
            {
                _log.Info(e.ToString());
                Recusar("A produção não subiu na versão " + versao + ": " + e.Message +
                        "\n\nVeja logs\\compose-up.log.");
                return false;
            }
            return true;
        }

        void CriarVolumes(Ambiente a)
        {
            foreach (var v in new[] { a.Pilha + "-pgdata", a.Pilha + "-mapas" })
                Executar(_docker, "volume create " + v, null, 60);
        }

        /// <summary>
        /// Garante as imagens da versão e sobe a pilha nela. `registrar` grava a
        /// primeira linha do histórico (instalação que ainda não tinha um).
        /// </summary>
        void SubirNaVersao(Ambiente a, string versao, bool registrar)
        {
            CriarVolumes(a);
            Status(a.Rotulo + ": preparando " + versao + "…");
            var env = GarantirImagens(a, versao);
            Status(a.Rotulo + ": subindo " + versao + "…");
            int codigo = Executar(_docker, Compose(a, "up -d --remove-orphans"), "compose-up", 900, null, env);
            if (codigo != 0) throw new Exception("docker compose up falhou (código " + codigo + ")");
            a.NoAr = true;
            a.VersaoNoAr = versao;
            if (registrar)
            {
                // As migrations rodam quando o servidor sobe: espera a saúde antes de ler a lista.
                ConferirSaude(a, versao, env);
                a.Historico.implantacoes.Add(new Implantacao
                {
                    versao = versao,
                    data = Agora(),
                    migracoes = Migracoes(a, env),
                    backup = "",
                });
                a.Historico.registro.Add(new Evento { acao = "inicial", de = "", para = versao, data = Agora(), backup = "" });
                a.Historico.Salvar(a.CaminhoHistorico);
            }
        }

        /// <summary>
        /// Os containers têm `restart: unless-stopped`: quem os reergue é o
        /// Docker. Aqui se avisa quando algum essencial está fora, lê a fila de
        /// deploy e, a cada VERIFICAR_MINUTOS, procura versão nova.
        /// </summary>
        void Vigiar()
        {
            string avisado = "";
            var proximaVerificacao = DateTime.Now.AddSeconds(20);
            var esperas = new WaitHandle[] { _parar, _verificarJa };
            while (true)
            {
                // 15 s: é também de quanto em quanto tempo a fila de deploy é lida.
                int qual = WaitHandle.WaitAny(esperas, 15000);
                if (qual == 0) break;
                if (qual == 1) proximaVerificacao = DateTime.Now;

                if (!_ocupado)
                {
                    try { ProcessarFila(); }
                    catch (Exception e) { _log.Info("fila de deploy: " + e.Message); }
                }

                if (!_ocupado)
                {
                    var fora = ServicosFora(_prd);
                    if (fora.Length > 0 && fora != avisado)
                    {
                        Status("fora: " + fora);
                        Avisar("Offensive Combat com problema", "Fora do ar: " + fora + "\nVeja logs\\stack.log.", ToolTipIcon.Warning);
                    }
                    else if (fora.Length == 0 && avisado.Length > 0)
                    {
                        Status("no ar de novo: " + _prd.VersaoNoAr);
                    }
                    avisado = fora;
                }
                if (_seguidorDeLogs == null || _seguidorDeLogs.HasExited) SeguirLogs();

                if (DateTime.Now >= proximaVerificacao)
                {
                    proximaVerificacao = DateTime.Now.AddMinutes(_minutosEntreVerificacoes);
                    try { ProcurarVersoes(); }
                    catch (Exception e) { _log.Info("verificação de versões falhou: " + e.Message); }
                }
            }
            _log.Info("pedido de parada recebido");
        }

        // ── Versões disponíveis ──────────────────────────────────────────────

        void ProcurarVersoes()
        {
            var tags = TagsRemotas();
            if (tags == null) return;
            Oferecer(_prd, MaisNova(_prd, tags));
            Oferecer(_hml, MaisNova(_hml, tags));
            AtualizarMenu();
            PublicarEstado();
        }

        /// <summary>
        /// A mais nova que o ambiente aceita: na produção, a final; na
        /// homologação, a rc ou — sem rc mais nova — a final.
        /// </summary>
        static Versao MaisNova(Ambiente a, IEnumerable<string> tags)
        {
            Versao maior = null;
            foreach (var t in tags)
            {
                var v = Versao.Ler(t);
                if (a.Aceita(v) && v.CompareTo(maior) > 0) maior = v;
            }
            return maior;
        }

        /// <summary>As tags do GitHub (null = sem rede).</summary>
        HashSet<string> TagsRemotas()
        {
            var saida = new StringBuilder();
            if (Executar("git", "-C \"" + _jogo + "\" ls-remote --tags --refs origin", null, 120, saida) != 0)
            {
                _log.Info("ls-remote falhou (sem rede?) — tento de novo depois");
                return null;
            }
            var tags = new HashSet<string>();
            foreach (var linha in saida.ToString().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                int i = linha.IndexOf("refs/tags/", StringComparison.Ordinal);
                if (i >= 0) tags.Add(linha.Substring(i + "refs/tags/".Length).Trim());
            }
            return tags;
        }

        void Oferecer(Ambiente a, Versao maisNova)
        {
            if (!a.Pronto || maisNova == null) { a.Disponivel = null; return; }
            var noAr = Versao.Ler(a.VersaoNoAr ?? (a.Historico.Atual != null ? a.Historico.Atual.versao : null));
            if (noAr != null && maisNova.CompareTo(noAr) <= 0) { a.Disponivel = null; return; }
            a.Disponivel = maisNova;
            // Homologação desligada: a versão fica disponível (API e "Ligar"), sem balão.
            if (a.ItemLigar != null && !a.NoAr) return;
            if (a.Avisada != maisNova.Nome)
            {
                a.Avisada = maisNova.Nome;
                Avisar("Versão nova: " + maisNova.Nome,
                    "Clique no ícone do Offensive Combat → \"Atualizar " + a.Rotulo + " para " + maisNova.Nome + "\".\n" +
                    "Nada muda até você clicar.", ToolTipIcon.Info);
            }
        }

        string UltimaFinalLocal()
        {
            var saida = new StringBuilder();
            if (Executar("git", "-C \"" + _jogo + "\" tag --list", null, 60, saida) != 0) return null;
            Versao maior = null;
            foreach (var t in saida.ToString().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var v = Versao.Ler(t);
                if (v != null && !v.EhRc && v.CompareTo(maior) > 0) maior = v;
            }
            return maior == null ? null : maior.Nome;
        }

        // ── Atualizar e Voltar ───────────────────────────────────────────────

        void PedirAtualizar(Ambiente a)
        {
            var alvo = a.Disponivel;
            if (alvo == null) return;
            string texto = "Atualizar " + a.Rotulo + " de " + (a.VersaoNoAr ?? "(nada)") + " para " + alvo.Nome + "?\n\n" +
                           "Antes é feito um backup do banco em\n" + a.PastaBackups + ".\n" +
                           "Quem está jogando cai da partida por alguns segundos enquanto troca a versão.";
            if (MessageBox.Show(texto, "Offensive Combat — atualizar " + a.Rotulo, MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) != DialogResult.Yes) return;
            Operar("atualizar " + a.Rotulo, delegate { Atualizar(a, alvo.Nome); });
        }

        void PedirVoltar(Ambiente a)
        {
            var anterior = a.Historico.Anterior;
            if (anterior == null || a.VersaoNoAr == null) return;
            string texto = "Voltar " + a.Rotulo + " de " + a.VersaoNoAr + " para " + anterior.versao + "?\n\n" +
                           "1. Backup do banco em " + a.PastaBackups + "\n" +
                           "2. As migrations que a " + anterior.versao + " não tinha são DESFEITAS (.down.sql) — o que\n" +
                           "    só existe nelas é apagado do banco. O backup guarda tudo.\n" +
                           "3. Sobe a " + anterior.versao + ".";
            if (MessageBox.Show(texto, "Offensive Combat — voltar " + a.Rotulo, MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning) != DialogResult.Yes) return;
            Operar("voltar " + a.Rotulo, delegate { Voltar(a); });
        }

        /// <summary>
        /// Uma operação de cada vez, fora da thread da tela. Interativa (bandeja):
        /// avisa em janela se já há outra ou se falhar. Remota (fila de deploy):
        /// devolve false se já há outra, e o próprio trabalho registra a falha no pedido.
        /// </summary>
        bool Operar(string nome, ThreadStart trabalho, bool interativa = true)
        {
            lock (_travaOperacao)
            {
                if (_ocupado)
                {
                    if (interativa)
                        MessageBox.Show("Já há uma operação em andamento. Espere ela terminar.", "Offensive Combat",
                            MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return false;
                }
                _ocupado = true;
            }
            AtualizarMenu();
            var t = new Thread(delegate()
            {
                try { trabalho(); }
                catch (Exception e)
                {
                    _log.Info(nome + " falhou: " + e);
                    if (interativa)
                        MessageBox.Show("Não deu para " + nome + ":\n\n" + e.Message +
                                        "\n\nDetalhes em logs\\operacoes.log e logs\\tunel.log.",
                            "Offensive Combat — " + nome, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally
                {
                    _ocupado = false;
                    _operacaoRemota = null;
                    Status("no ar: " + _prd.VersaoNoAr);
                    AtualizarMenu();
                    try { PublicarEstado(); } catch (Exception) { }
                }
            }) { IsBackground = true, Name = "operacao" };
            t.Start();
            return true;
        }

        /// <summary>
        /// build (o jogo segue no ar) → backup → sobe (o servidor aplica as
        /// migrations novas ao subir; uma que falhe não muda o banco e o servidor
        /// não sobe) → confere o /api/saude. Devolve a versão que ele respondeu.
        /// </summary>
        string Atualizar(Ambiente a, string para)
        {
            string de = a.VersaoNoAr;
            Status(a.Rotulo + ": buildando " + para + "…");
            var env = GarantirImagens(a, para);

            if (!a.NoAr)
            {
                // Primeira versão da homologação (ou a pilha não subiu no início):
                // banco e Redis de pé e saudáveis antes do backup.
                CriarVolumes(a);
                int ok = Executar(_docker, Compose(a, "up -d --wait banco redis"), "operacoes", 300, null, env);
                if (ok != 0) throw new Exception("banco/redis da " + a.Rotulo + " não subiram (código " + ok + ")");
            }
            string backup = null;
            if (a.Historico.Atual != null)
            {
                Status(a.Rotulo + ": backup do banco…");
                backup = Backup(a, de ?? a.Historico.Atual.versao, env);
            }

            Status(a.Rotulo + ": subindo " + para + "…");
            int codigo = Executar(_docker, Compose(a, "up -d --remove-orphans"), "operacoes", 900, null, env);
            if (codigo != 0)
                throw new Exception("docker compose up da " + para + " falhou (código " + codigo + "). " +
                                    "Use Voltar se precisar." + (backup != null ? "\nBackup: " + backup : ""));
            a.NoAr = true;
            a.VersaoNoAr = para;
            string conferida = ConferirSaude(a, para, env);

            a.Historico.implantacoes.Add(new Implantacao
            {
                versao = para,
                data = Agora(),
                migracoes = Migracoes(a, env),
                backup = backup ?? "",
            });
            a.Historico.registro.Add(new Evento { acao = "atualizar", de = de ?? "", para = para, data = Agora(), backup = backup ?? "" });
            a.Historico.Salvar(a.CaminhoHistorico);
            a.Disponivel = null;

            Avisar(a.Nome + " atualizada: " + para,
                conferida == para ? "O /api/saude já responde " + para + "."
                                  : "⚠️ O /api/saude respondeu \"" + conferida + "\". Veja logs\\stack.log.",
                conferida == para ? ToolTipIcon.Info : ToolTipIcon.Warning);
            PublicarEstado();
            return conferida;
        }

        /// <summary>
        /// Copia da imagem ATUAL os .down.sql das migrations que a versão de
        /// destino não tinha (é ela que os conhece) → para o servidor → backup →
        /// roda os .down.sql em ordem inversa numa transação só (falhou, nada
        /// muda e a versão atual volta) → sobe a versão de destino.
        /// `para` = qualquer versão ABAIXO do topo do histórico (null = a de baixo).
        /// </summary>
        void Voltar(Ambiente a, string para = null)
        {
            string de = a.VersaoNoAr;
            int indice = a.Historico.implantacoes.Count - 2;
            if (para != null && indice >= 0)
                indice = a.Historico.implantacoes.FindLastIndex(indice,
                    delegate(Implantacao i) { return i.versao == para; });
            if (indice < 0 || de == null)
                throw new Exception(para == null ? "não há versão anterior no histórico"
                                                 : para + " não está no histórico da " + a.Rotulo + " (abaixo da versão no ar)");
            var anterior = a.Historico.implantacoes[indice];

            // Imagens da anterior ANTES de parar qualquer coisa (rebuild se sumiram).
            Status(a.Rotulo + ": preparando " + anterior.versao + "…");
            var envAnterior = GarantirImagens(a, anterior.versao);
            var envAtual = Variaveis(a, de, envAnterior["JOGO_CONTEXT"]);

            // O que desfazer: o que está no banco e a versão de destino não tinha.
            var desfazer = new List<string>();
            foreach (var m in Migracoes(a, envAtual))
                if (!anterior.migracoes.Contains(m)) desfazer.Add(m);
            desfazer.Sort(StringComparer.Ordinal);
            desfazer.Reverse();
            string script = null;
            if (desfazer.Count > 0) script = MontarVolta(a, desfazer, envAtual);

            Status(a.Rotulo + ": parando o servidor…");
            Executar(_docker, Compose(a, "stop jogo"), "operacoes", 300, null, envAtual);

            Status(a.Rotulo + ": backup do banco…");
            string backup;
            try { backup = Backup(a, de, envAtual); }
            catch (Exception)
            {
                Executar(_docker, Compose(a, "up -d --remove-orphans"), "operacoes", 900, null, envAtual);
                throw;
            }

            if (script != null)
            {
                Status(a.Rotulo + ": desfazendo " + desfazer.Count + " migration(s)…");
                const string tmp = "/tmp/offensive-voltar.sql";
                int codigo = Executar(_docker, Compose(a, "cp \"" + script + "\" banco:" + tmp), "operacoes", 120, null, envAtual);
                if (codigo == 0)
                    codigo = Executar(_docker, Compose(a, "exec -T banco psql -v ON_ERROR_STOP=1 -1 -U oc -d oc -f " + tmp),
                        "operacoes", 1800, null, envAtual);
                Executar(_docker, Compose(a, "exec -T banco rm -f " + tmp), null, 60, null, envAtual);
                File.Delete(script);
                if (codigo != 0)
                {
                    // Uma transação só (-1): falhou, o banco ficou como estava.
                    Executar(_docker, Compose(a, "up -d --remove-orphans"), "operacoes", 900, null, envAtual);
                    throw new Exception("Desfazer as migrations (" + string.Join(", ", desfazer.ToArray()) + ") falhou " +
                                        "(código " + codigo + "). A " + de + " voltou a subir; o banco não mudou.\nBackup: " + backup);
                }
            }

            Status(a.Rotulo + ": subindo " + anterior.versao + "…");
            int up = Executar(_docker, Compose(a, "up -d --remove-orphans"), "operacoes", 900, null, envAnterior);
            if (up != 0)
                throw new Exception("docker compose up da " + anterior.versao + " falhou (código " + up + "). " +
                                    "O banco já está no schema da " + anterior.versao + ".\nBackup: " + backup);
            a.VersaoNoAr = anterior.versao;
            string conferida = ConferirSaude(a, anterior.versao, envAnterior);

            a.Historico.implantacoes.RemoveRange(indice + 1, a.Historico.implantacoes.Count - indice - 1);
            a.Historico.registro.Add(new Evento { acao = "voltar", de = de, para = anterior.versao, data = Agora(), backup = backup });
            a.Historico.Salvar(a.CaminhoHistorico);
            a.Avisada = ""; // a versão desfeita volta a ser oferecida

            Avisar(a.Nome + " voltou para " + anterior.versao,
                (conferida == anterior.versao ? "" : "⚠️ O /api/saude respondeu \"" + conferida + "\". ") +
                "Backup da " + de + ": " + Path.GetFileName(backup), ToolTipIcon.Info);
            PublicarEstado();
            _verificarJa.Set();
        }

        /// <summary>
        /// Junta os .down.sql (já na ordem de desfazer) num arquivo só. Cada um
        /// apaga a própria linha de schema_migrations. Vêm do container `jogo`
        /// da versão no ar, ainda de pé. Falhou aqui, nada foi parado.
        /// </summary>
        string MontarVolta(Ambiente a, List<string> desfazer, Dictionary<string, string> env)
        {
            var pasta = Path.Combine(a.Pasta, "voltar");
            if (Directory.Exists(pasta)) Directory.Delete(pasta, true);
            Directory.CreateDirectory(pasta);
            var sql = new StringBuilder();
            foreach (var m in desfazer)
            {
                if (!NomeDeMigracao.IsMatch(m)) throw new Exception("migration com nome inesperado no banco: " + m);
                string down = m.Substring(0, m.Length - ".sql".Length) + ".down.sql";
                string local = Path.Combine(pasta, down);
                int codigo = Executar(_docker, Compose(a, "cp jogo:/app/server/migrations/" + down + " \"" + local + "\""),
                    "operacoes", 120, null, env);
                if (codigo != 0 || !File.Exists(local))
                    throw new Exception("a versão no ar não tem " + down + ": não dá para desfazer " + m + " (nada foi alterado)");
                var conteudo = File.ReadAllText(local, Encoding.UTF8);
                // `-1` já abre a transação: um COMMIT no meio deixaria o resto fora dela.
                if (Regex.IsMatch(conteudo, @"^\s*(commit|rollback|begin)\s*;", RegexOptions.IgnoreCase | RegexOptions.Multiline))
                    throw new Exception(down + " controla transação por conta própria; desfaça à mão (nada foi alterado)");
                sql.AppendLine("-- " + down);
                sql.AppendLine(conteudo);
                sql.AppendLine(";");
            }
            var script = Path.Combine(pasta, "voltar.sql");
            File.WriteAllText(script, sql.ToString(), new UTF8Encoding(false));
            foreach (var f in Directory.GetFiles(pasta, "*.down.sql")) File.Delete(f);
            return script;
        }

        /// <summary>Exporta a tag e builda só o que falta: imagem já no disco não é refeita.</summary>
        Dictionary<string, string> GarantirImagens(Ambiente a, string versao)
        {
            if (Versao.Ler(versao) == null) throw new Exception("versão fora do formato: " + versao);
            var env = Variaveis(a, versao, a.Contexto);
            bool temJogo = Executar(_docker, "image inspect " + a.Pilha + "-jogo:" + versao, null, 60) == 0;
            bool temWeb = Executar(_docker, "image inspect " + a.Pilha + "-web:" + versao, null, 60) == 0;
            if (temJogo && temWeb)
            {
                // Pasta de contexto só precisa existir para o `${..:?}` do compose.
                Directory.CreateDirectory(a.Contexto);
                return env;
            }
            BuscarTags();
            if (Exportar("refs/tags/" + versao, a.Contexto) == null)
                throw new Exception("não consegui exportar a tag " + versao + " (veja logs\\exportar.log)");
            int codigo = Executar(_docker, Compose(a, "build"), "compose-up", 3600, null, env);
            if (codigo != 0) throw new Exception("o build da " + versao + " falhou (código " + codigo + ", logs\\compose-up.log)");
            return env;
        }

        /// <summary>
        /// pg_dump no formato custom, dentro do container (o binário não passa
        /// pelo stdout do .exe, que é texto), e `compose cp` para o disco. Os
        /// modelos .glb dos mapas (volume -mapas) não entram: só se acrescentam,
        /// um arquivo por SHA-256, e nenhuma versão os apaga.
        /// </summary>
        string Backup(Ambiente a, string versao, Dictionary<string, string> env)
        {
            Directory.CreateDirectory(a.PastaBackups);
            string nome = Regex.Replace(versao, "[^A-Za-z0-9_.-]", "-") + "-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".dump";
            string destino = Path.Combine(a.PastaBackups, nome);
            const string tmp = "/tmp/offensive-backup.dump";
            int codigo = Executar(_docker, Compose(a, "exec -T banco pg_dump -U oc -Fc -f " + tmp + " oc"),
                "operacoes", 1800, null, env);
            if (codigo != 0) throw new Exception("pg_dump falhou (código " + codigo + ") — nada foi alterado");
            codigo = Executar(_docker, Compose(a, "cp banco:" + tmp + " \"" + destino + "\""), "operacoes", 600, null, env);
            Executar(_docker, Compose(a, "exec -T banco rm -f " + tmp), null, 60, null, env);
            if (codigo != 0 || !File.Exists(destino) || new FileInfo(destino).Length == 0)
                throw new Exception("o backup não chegou ao disco (" + destino + ") — nada foi alterado");
            _log.Escrever("operacoes", "backup: " + destino + " (" + new FileInfo(destino).Length + " bytes)");
            return destino;
        }

        /// <summary>As linhas de schema_migrations (o que está aplicado no banco).</summary>
        List<string> Migracoes(Ambiente a, Dictionary<string, string> env)
        {
            var saida = new StringBuilder();
            int codigo = Executar(_docker, Compose(a, "exec -T banco psql -U oc -d oc -tAc \"select name from schema_migrations order by name\""),
                null, 60, saida, env);
            var lista = new List<string>();
            if (codigo != 0) return lista;
            foreach (var linha in saida.ToString().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var nome = linha.Trim();
                if (NomeDeMigracao.IsMatch(nome)) lista.Add(nome);
            }
            return lista;
        }

        /// <summary>Espera o /api/saude responder e devolve a versão que ele diz.</summary>
        string ConferirSaude(Ambiente a, string esperada, Dictionary<string, string> env)
        {
            string ultima = "";
            // Migrations + boot do servidor (a thread dos mapas): 3 min de folga.
            var limite = DateTime.Now.AddSeconds(180);
            while (DateTime.Now < limite)
            {
                var saida = new StringBuilder();
                Executar(_docker, Compose(a, "exec -T jogo wget -qO- http://127.0.0.1:8787/api/saude"), null, 30, saida, env);
                var m = VersaoNaSaude.Match(saida.ToString());
                if (m.Success)
                {
                    ultima = m.Groups[1].Value;
                    if (ultima == esperada) return ultima;
                }
                Thread.Sleep(3000);
            }
            return ultima.Length > 0 ? ultima : "sem resposta";
        }

        Dictionary<string, string> Variaveis(Ambiente a, string versao, string contexto)
        {
            var env = new Dictionary<string, string>();
            env[a.VarPasta] = a.Pasta.Replace('\\', '/');
            env["JOGO_CONTEXT"] = contexto;
            env["VERSAO"] = versao;
            return env;
        }

        /// <summary>Para comandos que não dependem da versão (ps, logs, exec, stop).</summary>
        Dictionary<string, string> VariaveisNeutras(Ambiente a)
        {
            Directory.CreateDirectory(a.Contexto);
            return Variaveis(a, "x", a.Contexto);
        }

        static string Agora() { return DateTime.Now.ToString("yyyy-MM-ddTHH:mm:sszzz"); }

        static string AgoraUtc() { return DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"); }

        // ── Homologação sob demanda ──────────────────────────────────────────

        void PedirLigarOuDesligar()
        {
            if (_hml.NoAr)
            {
                if (MessageBox.Show("Desligar a homologação?\n\nOs containers param e os dados ficam. Ela segue desligada " +
                                    "nas próximas vezes que o Offensive Combat subir, até você ligar de novo — ou até um " +
                                    "deploy de homologação pela API ligá-la.", "Offensive Combat — homologação",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                Operar("desligar a homologação", delegate { DesligarHomologacao(); });
                return;
            }
            if (!_hml.Pronto) PrepararHomologacao();
            if (!_hml.Pronto)
            {
                MessageBox.Show("A homologação ainda não está configurada neste PC (" + _hml.Motivo + ").\n\n" +
                                "Rode uma vez: deploy\\local\\configurar-cloudflare.ps1 -Homologacao\n" +
                                "(passo a passo em deploy\\local\\README.md).",
                    "Offensive Combat — homologação", MessageBoxButtons.OK, MessageBoxIcon.Information);
                AtualizarMenu();
                return;
            }
            Operar("ligar a homologação", delegate { LigarHomologacao(); });
        }

        /// <summary>Na versão do histórico; na primeira vez, na rc mais nova.</summary>
        void LigarHomologacao()
        {
            _hml.Preferencia = true;
            if (_hml.Historico.Atual != null)
            {
                SubirNaVersao(_hml, _hml.Historico.Atual.versao, false);
                Avisar("Homologação ligada: " + _hml.VersaoNoAr, _hml.Url, ToolTipIcon.Info);
                return;
            }
            Atualizar(_hml, EscolherVersaoNova(_hml, null));
        }

        void DesligarHomologacao()
        {
            _hml.Preferencia = false;
            Status("homologação: parando…");
            Executar(_docker, Compose(_hml, "stop"), "operacoes", 300, null, VariaveisNeutras(_hml));
            _hml.NoAr = false;
            _hml.VersaoNoAr = null;
            Avisar("Homologação desligada", "Os dados ficam. Ligue de novo pela bandeja, ou um deploy de " +
                                            "homologação pela API liga sozinho.", ToolTipIcon.Info);
        }

        /// <summary>Deploy de homologação pela API com ela desligada: liga antes.</summary>
        void GarantirHomologacaoLigada()
        {
            if (_hml.NoAr) return;
            if (!_hml.Pronto) PrepararHomologacao();
            if (!_hml.Pronto)
                throw new Exception("a homologação não está configurada neste PC (" + _hml.Motivo + ")");
            _hml.Preferencia = true;
            // Sem versão ainda, o Atualizar sobe banco e Redis junto com a primeira rc.
            if (_hml.Historico.Atual != null) SubirNaVersao(_hml, _hml.Historico.Atual.versao, false);
        }

        // ── Chave de deploy ──────────────────────────────────────────────────

        void PedirChaveDeDeploy()
        {
            if (!_prd.Pronto || !File.Exists(_prd.ArquivoEnv))
            {
                MessageBox.Show("Espere a produção subir antes de gerar a chave.", "Offensive Combat",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            bool jaExiste = new Chaves(_prd.ArquivoEnv).Texto("DEPLOY_KEY_HASH", "").Length > 0;
            string texto = (jaExiste ? "Já existe uma chave de deploy. Gerar outra INVALIDA a atual: quem a usa " +
                                       "(o segredo DEPLOY_KEY no GitHub) precisa receber a nova.\n\n" : "") +
                           "Quem tiver a chave atualiza e volta a produção e a homologação pela API.\n" +
                           "Ela aparece uma vez só; aqui fica guardado só o hash dela.\n\nGerar agora?";
            if (MessageBox.Show(texto, "Offensive Combat — chave de deploy", MessageBoxButtons.YesNo,
                    jaExiste ? MessageBoxIcon.Warning : MessageBoxIcon.Question) != DialogResult.Yes) return;

            string chave = "ocdeploy_" + Aleatorio(32);
            string hash = Sha256(chave);
            foreach (var a in new[] { _prd, _hml })
                if (a.ArquivoEnv != null && File.Exists(a.ArquivoEnv)) GravarNoEnv(a.ArquivoEnv, "DEPLOY_KEY_HASH", hash);
            _log.Info("chave de deploy gerada (hash gravado nos .env)");
            MostrarChave(chave);
            // O servidor só lê o .env ao subir: recria o container dele nas pilhas no ar.
            Operar("aplicar a chave de deploy", delegate
            {
                foreach (var a in new[] { _prd, _hml })
                {
                    if (!a.NoAr) continue;
                    Status(a.Rotulo + ": aplicando a chave no servidor…");
                    var env = Variaveis(a, a.VersaoNoAr, a.Contexto);
                    Directory.CreateDirectory(a.Contexto);
                    int codigo = Executar(_docker, Compose(a, "up -d --no-deps jogo"), "operacoes", 600, null, env);
                    if (codigo != 0) throw new Exception("recriar o servidor da " + a.Rotulo + " falhou (código " + codigo + ")");
                }
                Avisar("Chave de deploy ativa", "A API já aceita a chave nova.", ToolTipIcon.Info);
            });
        }

        void MostrarChave(string chave)
        {
            try { Clipboard.SetText(chave); } catch (Exception) { }
            using (var f = new Form
            {
                Text = "Offensive Combat — chave de deploy",
                Width = 660, Height = 250,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false, MinimizeBox = false, TopMost = true,
            })
            {
                var rotulo = new Label
                {
                    Left = 12, Top = 12, Width = 620, Height = 80,
                    Text = "Já está na área de transferência. Guarde no GitHub como segredo DEPLOY_KEY " +
                           "(Settings → Secrets and variables → Actions) do offensive-combat-reload, " +
                           "ou passe para os devs por um canal seguro.\n\n" +
                           "Ela não aparece de novo: se perder, gere outra (a atual deixa de valer).",
                };
                var caixa = new TextBox
                {
                    Text = chave, ReadOnly = true, Left = 12, Top = 100, Width = 620,
                    Font = new Font(FontFamily.GenericMonospace, 9),
                };
                var copiar = new Button { Text = "Copiar", Left = 452, Top = 140, Width = 85 };
                copiar.Click += delegate { try { Clipboard.SetText(chave); } catch (Exception) { } };
                var fechar = new Button { Text = "Fechar", Left = 547, Top = 140, Width = 85, DialogResult = DialogResult.OK };
                f.Controls.AddRange(new Control[] { rotulo, caixa, copiar, fechar });
                f.AcceptButton = fechar;
                f.ShowDialog();
            }
        }

        /// <summary>Troca (ou acrescenta) CHAVE=valor no .env, sem mexer no resto.</summary>
        static void GravarNoEnv(string caminho, string chave, string valor)
        {
            var linhas = new List<string>(File.ReadAllLines(caminho, Encoding.UTF8));
            var padrao = new Regex("^\\s*" + Regex.Escape(chave) + "\\s*=");
            bool trocou = false;
            for (int i = 0; i < linhas.Count; i++)
            {
                if (!padrao.IsMatch(linhas[i])) continue;
                linhas[i] = chave + "=" + valor;
                trocou = true;
            }
            if (!trocou) linhas.Add(chave + "=" + valor);
            var tmp = caminho + ".tmp";
            File.WriteAllLines(tmp, linhas.ToArray(), new UTF8Encoding(false));
            File.Replace(tmp, caminho, null);
        }

        /// <summary>O hash da chave que a produção já usa (para o .env.hml gerado depois).</summary>
        string HashDeDeployAtual()
        {
            if (_prd.ArquivoEnv == null || !File.Exists(_prd.ArquivoEnv)) return "";
            return new Chaves(_prd.ArquivoEnv).Texto("DEPLOY_KEY_HASH", "");
        }

        // ── Deploy remoto: fila no Redis de cada pilha ───────────────────────
        //
        // A rota POST /api/deploy (server/deploy.ts) grava o pedido em
        // `deploy:pedido:<id>` e empurra o id em `deploy:fila`. Qualquer pilha no
        // ar recebe pedidos para qualquer ambiente: com a produção quebrada, o
        // "voltar" ainda chega pela API da homologação.

        void ProcessarFila()
        {
            foreach (var entrada in new[] { _prd, _hml })
            {
                if (!entrada.Pronto || !entrada.NoAr || _ocupado) continue;
                string id;
                try { id = Redis(entrada, "LPOP deploy:fila", null); }
                catch (Exception e) { _log.Info("fila de deploy da " + entrada.Rotulo + ": " + e.Message); continue; }
                if (id.Length == 0) continue;
                if (!IdDePedido.IsMatch(id)) { _log.Info("fila de deploy: id fora do formato, descartado"); continue; }
                var pedido = LerPedido(entrada, id);
                if (pedido == null) { _log.Info("fila de deploy: o pedido " + id + " não existe mais"); continue; }

                var ent = entrada;
                var idDoPedido = id;
                _operacaoRemota = id;
                if (!Operar("deploy " + id, delegate { ExecutarPedido(ent, idDoPedido, pedido); }, false))
                {
                    // Uma operação da bandeja começou agora: o pedido volta para a frente da fila.
                    Redis(entrada, "LPUSH deploy:fila " + id, null);
                    _operacaoRemota = null;
                }
                return; // um pedido por vez
            }
        }

        void ExecutarPedido(Ambiente entrada, string id, Dictionary<string, object> p)
        {
            string amb = Texto(p, "ambiente"), acao = Texto(p, "acao"), versao = Texto(p, "versao");
            if (versao != null && versao.Length == 0) versao = null;
            Ambiente alvo = amb == "prd" ? _prd : amb == "hml" ? _hml : null;

            p["status"] = "em_andamento";
            p["iniciado_em"] = AgoraUtc();
            p["mensagem"] = "";
            GravarPedido(entrada, id, p);
            Avisar("Deploy pela API: " + acao + " " + (alvo != null ? alvo.Rotulo : amb),
                (versao ?? (acao == "voltar" ? "versão anterior" : "versão mais nova")) +
                " — pedido de " + (Texto(p, "origem_ip") ?? "?"), ToolTipIcon.Info);

            string status = "concluido", mensagem = "";
            try
            {
                if (alvo == null || (acao != "atualizar" && acao != "voltar"))
                    throw new Exception("pedido inválido: " + amb + "/" + acao);
                if (alvo == _hml) GarantirHomologacaoLigada();
                if (!alvo.Pronto) throw new Exception("a " + alvo.Rotulo + " não está pronta: " + alvo.Motivo);

                string de = alvo.VersaoNoAr;
                p["de"] = de;
                if (acao == "atualizar")
                {
                    string para = EscolherVersaoNova(alvo, versao);
                    p["para"] = para;
                    GravarPedido(entrada, id, p);
                    string conferida = Atualizar(alvo, para);
                    if (conferida == para) mensagem = alvo.Nome + " em " + para + ".";
                    else if (de != null && alvo.Historico.Anterior != null && alvo.Historico.Anterior.versao == de)
                    {
                        // A versão nova não respondeu: volta sozinho (só no deploy pela API).
                        Voltar(alvo, de);
                        status = "revertido";
                        mensagem = "O /api/saude respondeu \"" + conferida + "\" em vez de " + para +
                                   "; a " + alvo.Rotulo + " voltou para " + de + ".";
                    }
                    else
                    {
                        status = "falhou";
                        mensagem = "O /api/saude respondeu \"" + conferida + "\" em vez de " + para +
                                   " e não há versão anterior para voltar.";
                    }
                }
                else
                {
                    string para = versao ?? (alvo.Historico.Anterior != null ? alvo.Historico.Anterior.versao : null);
                    if (para == null) throw new Exception("não há versão anterior no histórico da " + alvo.Rotulo);
                    p["para"] = para;
                    GravarPedido(entrada, id, p);
                    Voltar(alvo, para);
                    mensagem = alvo.Nome + " voltou para " + para + ".";
                }
            }
            catch (Exception e)
            {
                _log.Info("deploy " + id + " falhou: " + e);
                status = "falhou";
                mensagem = e.Message;
                Avisar("Deploy pela API falhou", e.Message, ToolTipIcon.Error);
            }
            p["status"] = status;
            p["mensagem"] = mensagem;
            p["terminado_em"] = AgoraUtc();
            try { GravarPedido(entrada, id, p); }
            catch (Exception e) { _log.Info("não consegui gravar o fim do pedido " + id + ": " + e.Message); }
        }

        /// <summary>
        /// A versão para onde o Atualizar leva: a pedida (tem de existir no
        /// GitHub, ser do tipo do ambiente e mais nova que a no ar) ou, sem
        /// pedido, a mais nova do tipo do ambiente.
        /// </summary>
        string EscolherVersaoNova(Ambiente a, string pedida)
        {
            var tags = TagsRemotas();
            if (tags == null) throw new Exception("não consegui ler as tags no GitHub (sem rede?)");
            Versao alvo;
            if (pedida == null)
            {
                alvo = MaisNova(a, tags);
                if (alvo == null) throw new Exception("nenhuma versão para a " + a.Rotulo + " no repositório");
            }
            else
            {
                alvo = Versao.Ler(pedida);
                if (alvo == null) throw new Exception("versão fora do formato: " + pedida);
                if (!a.Aceita(alvo)) throw new Exception("a " + a.Rotulo + " só recebe versão final");
                if (!tags.Contains(pedida)) throw new Exception("a tag " + pedida + " não existe no repositório");
            }
            var noAr = Versao.Ler(a.VersaoNoAr);
            if (noAr != null && alvo.CompareTo(noAr) <= 0)
                throw new Exception(alvo.Nome + " não é mais nova que a " + noAr.Nome + " no ar (para trás é acao=voltar)");
            return alvo.Nome;
        }

        Dictionary<string, object> LerPedido(Ambiente a, string id)
        {
            string json;
            try { json = Redis(a, "GET deploy:pedido:" + id, null); }
            catch (Exception e) { _log.Info("ler o pedido " + id + ": " + e.Message); return null; }
            if (json.Length == 0) return null;
            try { return new JavaScriptSerializer().DeserializeObject(json) as Dictionary<string, object>; }
            catch (Exception) { return null; }
        }

        /// <summary>`id` já validado (IdDePedido): é ele que entra no comando, nunca o do JSON.</summary>
        void GravarPedido(Ambiente a, string id, Dictionary<string, object> p)
        {
            Redis(a, "-x SETEX deploy:pedido:" + id + " 2592000", JsonAscii(p));
        }

        /// <summary>O que GET /api/deploy mostra: versões, histórico e a operação em curso.</summary>
        void PublicarEstado()
        {
            var estado = new Dictionary<string, object>();
            estado["atualizado_em"] = AgoraUtc();
            estado["operacao"] = _operacaoRemota;
            estado["prd"] = EstadoDe(_prd);
            estado["hml"] = EstadoDe(_hml);
            string json = JsonAscii(estado);
            foreach (var a in new[] { _prd, _hml })
            {
                if (!a.Pronto || !a.NoAr) continue;
                try { Redis(a, "-x SET deploy:estado", json); }
                catch (Exception e) { _log.Info("estado de deploy não publicado na " + a.Rotulo + ": " + e.Message); }
            }
        }

        static Dictionary<string, object> EstadoDe(Ambiente a)
        {
            var historico = new List<string>();
            foreach (var i in a.Historico.implantacoes) historico.Add(i.versao);
            var d = new Dictionary<string, object>();
            d["ligada"] = a.NoAr;
            d["versao"] = a.VersaoNoAr;
            d["disponivel"] = a.Disponivel != null ? a.Disponivel.Nome : null;
            d["historico"] = historico;
            return d;
        }

        /// <summary>
        /// redis-cli no container `redis` da pilha; a senha é a REDIS_PASSWORD
        /// do próprio container. `entrada` vai pelo stdin (com `-x`, vira o
        /// último argumento do comando).
        /// </summary>
        string Redis(Ambiente a, string comando, string entrada)
        {
            var saida = new StringBuilder();
            int codigo = Executar(_docker,
                Compose(a, "exec -T redis sh -c \"REDISCLI_AUTH=$REDIS_PASSWORD redis-cli " + comando + "\""),
                null, 30, saida, VariaveisNeutras(a), entrada);
            if (codigo != 0) throw new Exception("redis-cli falhou (código " + codigo + ")");
            return saida.ToString().Trim();
        }

        static string Texto(Dictionary<string, object> d, string chave)
        {
            object v;
            return d.TryGetValue(chave, out v) && v != null ? v.ToString() : null;
        }

        /// <summary>JSON só com ASCII (o stdin do processo não é UTF-8 no .NET Framework).</summary>
        static string JsonAscii(object o)
        {
            var json = new JavaScriptSerializer().Serialize(o);
            var sb = new StringBuilder(json.Length);
            foreach (char c in json)
            {
                if (c > 127) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.ToString();
        }

        static string Sha256(string texto)
        {
            using (var h = SHA256.Create())
                return BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(texto))).Replace("-", "").ToLowerInvariant();
        }

        // ── Docker e git ─────────────────────────────────────────────────────

        string ServicosFora(Ambiente a)
        {
            var saida = new StringBuilder();
            Executar(_docker, Compose(a, "ps --status running --services"), null, 60, saida, VariaveisNeutras(a));
            var rodando = new HashSet<string>(saida.ToString().Split(
                new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries));
            var fora = new List<string>();
            foreach (var s in Essenciais) if (!rodando.Contains(s)) fora.Add(s);
            return string.Join(", ", fora.ToArray());
        }

        void SeguirLogs()
        {
            _seguidorDeLogs = Iniciar(_docker, Compose(_prd, "logs -f --no-color --since 1m"), "stack", null,
                VariaveisNeutras(_prd));
        }

        static string Compose(Ambiente a, string resto)
        {
            return "compose -f \"" + a.Compose + "\" --env-file \"" + a.ArquivoEnv + "\" " + resto;
        }

        bool EsperarDocker()
        {
            var limite = DateTime.Now.AddMinutes(5);
            bool tentouAbrir = false;
            while (DateTime.Now < limite)
            {
                if (_parar.WaitOne(0)) return false;
                if (Executar(_docker, "info --format {{.ServerVersion}}", null, 30) == 0) return true;
                var desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    @"Docker\Docker\Docker Desktop.exe");
                if (!tentouAbrir && File.Exists(desktop))
                {
                    tentouAbrir = true;
                    _log.Info("abrindo o Docker Desktop");
                    Process.Start(desktop);
                }
                Thread.Sleep(5000);
            }
            return false;
        }

        /// <summary>Traz as tags do GitHub para o clone local (o `git archive` lê dele).</summary>
        void BuscarTags()
        {
            if (Executar("git", "-C \"" + _jogo + "\" fetch --tags --force --quiet origin", "exportar", 300) != 0)
                _log.Info("git fetch --tags falhou (sem rede?) — sigo com as tags locais");
        }

        /// <summary>`git archive` da referência para uma pasta limpa.</summary>
        string Exportar(string referencia, string destino)
        {
            if (Directory.Exists(destino)) Directory.Delete(destino, true);
            Directory.CreateDirectory(destino);
            var tar = Path.Combine(Path.GetDirectoryName(destino), Path.GetFileName(destino) + ".tar");
            if (Executar("git", "-C \"" + _jogo + "\" archive --format=tar -o \"" + tar + "\" " + referencia,
                    "exportar", 300) != 0)
                return null;
            var tarExe = Path.Combine(Environment.SystemDirectory, "tar.exe");
            int codigo = Executar(tarExe, "-xf \"" + tar + "\" -C \"" + destino + "\"", "exportar", 300);
            File.Delete(tar);
            return codigo == 0 ? destino : null;
        }

        /// <summary>Roda e espera. Saída vai para logs\{arquivo}.log (ou para `saida`).</summary>
        int Executar(string exe, string args, string arquivo, int segundos, StringBuilder saida = null,
            Dictionary<string, string> env = null, string entrada = null)
        {
            var p = Iniciar(exe, args, arquivo, saida, env, entrada);
            if (p == null) return -1;
            if (!p.WaitForExit(segundos * 1000))
            {
                try { p.Kill(); } catch (Exception) { }
                _log.Info("tempo esgotado: " + exe + " " + args);
                return -2;
            }
            p.WaitForExit(); // drena a saída assíncrona
            return p.ExitCode;
        }

        Process Iniciar(string exe, string args, string arquivo, StringBuilder saida = null,
            Dictionary<string, string> env = null, string entrada = null)
        {
            var info = new ProcessStartInfo(exe, args)
            {
                WorkingDirectory = _pasta,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = entrada != null,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            if (env != null) foreach (var kv in env) info.EnvironmentVariables[kv.Key] = kv.Value;
            if (arquivo != null) _log.Escrever(arquivo, "$ " + exe + " " + args);
            var p = new Process { StartInfo = info };
            DataReceivedEventHandler coletar = delegate(object s, DataReceivedEventArgs e)
            {
                if (e.Data == null) return;
                if (saida != null) lock (saida) saida.AppendLine(e.Data);
                if (arquivo != null) _log.Escrever(arquivo, e.Data);
            };
            p.OutputDataReceived += coletar;
            p.ErrorDataReceived += coletar;
            try { p.Start(); }
            catch (Exception e)
            {
                _log.Info("não consegui executar " + exe + ": " + e.Message);
                return null;
            }
            _job.Adicionar(p);
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            if (entrada != null)
            {
                // Só ASCII aqui (JsonAscii): o stdin usa a página de código do console.
                p.StandardInput.Write(entrada);
                p.StandardInput.Close();
            }
            return p;
        }

        // ── Segredos ─────────────────────────────────────────────────────────

        static bool SenhaFraca(string s)
        {
            return s.Length < 8 || !Regex.IsMatch(s, "[A-Za-z]") || !Regex.IsMatch(s, "[0-9]");
        }

        /// <summary>Segredos novos, só desta instalação. Hex: seguros dentro de URL.</summary>
        string GerarEnv(bool homologacao)
        {
            string host = (homologacao ? "offensive-combat-hml." : "offensive-combat.") + _dominio;
            string pg = Aleatorio(24), redis = Aleatorio(24);
            var sb = new StringBuilder();
            sb.AppendLine("# " + (homologacao ? "HOMOLOGAÇÃO" : "Produção") + " LOCAL do Offensive Combat — gerado pelo OffensiveTunel.exe em " +
                          DateTime.Now.ToString("yyyy-MM-dd HH:mm"));
            sb.AppendLine("# ⚠️ Segredos reais. Não copie para o repositório.");
            sb.AppendLine("# A senha do banco só vale na criação do volume: trocá-la depois exige ALTER USER no banco.");
            sb.AppendLine();
            sb.AppendLine("PG_SENHA=" + pg);
            sb.AppendLine("DATABASE_URL=postgres://oc:" + pg + "@banco:5432/oc");
            sb.AppendLine("REDIS_PASSWORD=" + redis);
            sb.AppendLine("REDIS_URL=redis://:" + redis + "@redis:6379");
            sb.AppendLine();
            sb.AppendLine("# Admin do jogo, criado no primeiro boot enquanto nenhuma conta é admin.");
            sb.AppendLine("ADMIN_BOOTSTRAP_EMAIL=" + _emailAdmin);
            sb.AppendLine("ADMIN_BOOTSTRAP_PASSWORD=" + SenhaForte());
            sb.AppendLine();
            sb.AppendLine("# Mesma origem (https://" + host + ") já é aceita; aqui só outras.");
            sb.AppendLine("ORIGENS_PERMITIDAS=");
            sb.AppendLine();
            sb.AppendLine("# Gmail (senha de app) para os links de recuperação de senha. Vazio = só no log.");
            sb.AppendLine("SMTP_USUARIO=");
            sb.AppendLine("SMTP_SENHA_APP=");
            sb.AppendLine("SMTP_REMETENTE=");
            sb.AppendLine();
            sb.AppendLine("# \"Entrar com Discord\": cadastre o retorno https://" + host + "/api/auth/discord/retorno no app do Discord.");
            sb.AppendLine("DISCORD_CLIENT_ID=");
            sb.AppendLine("DISCORD_CLIENT_SECRET=");
            sb.AppendLine("DISCORD_RETORNOS=https://" + host + "/api/auth/discord/retorno");
            sb.AppendLine();
            sb.AppendLine("# Deploy remoto (POST /api/deploy): sha256 da chave gerada na bandeja");
            sb.AppendLine("# (\"Gerar chave de deploy…\"). Vazio = a rota responde 404.");
            sb.AppendLine("DEPLOY_KEY_HASH=" + HashDeDeployAtual());
            return sb.ToString();
        }

        static string Aleatorio(int bytes)
        {
            var b = new byte[bytes];
            using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(b);
            return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
        }

        static string SenhaForte()
        {
            const string letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
            const string digitos = "23456789";
            string todos = letras + digitos;
            var b = new byte[20];
            using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(b);
            var sb = new StringBuilder();
            for (int i = 0; i < b.Length; i++) sb.Append(todos[b[i] % todos.Length]);
            // Garante a regra (letra + número) sem depender da sorte.
            sb[0] = letras[b[0] % letras.Length];
            sb[1] = digitos[b[1] % digitos.Length];
            return sb.ToString();
        }

        void Encerrar()
        {
            if (_subiu || _parar.WaitOne(0))
            {
                Status("parando…");
                foreach (var a in new[] { _prd, _hml })
                {
                    if (!a.NoAr && a != _prd) continue;
                    if (a.ArquivoEnv == null || !File.Exists(a.ArquivoEnv)) continue;
                    Executar(_docker, Compose(a, "stop"), "compose-up", 300, null, VariaveisNeutras(a));
                }
            }
            if (_seguidorDeLogs != null) try { _seguidorDeLogs.Kill(); } catch (Exception) { }
            _job.Dispose();
            _log.Info("encerrado");
            _icone.Visible = false;
            _icone.Dispose();
            Application.Exit();
        }
    }
}
