// Установщик SoundCloud 2: маленький загрузчик в духе установщика Claude, в цветах SoundCloud.
// Сам клиент (Electron, ~100 МБ) в загрузчик не вшит: загрузчик читает latest.yml последнего релиза, качает полный
// установщик, сверяет SHA-512 и ставит его тихо (/S), потом запускает клиент. Так файл, который люди скачивают, весит
// ~100 КБ, а обновления из клиента идут как раньше, через тот же полный установщик.
// WPF на .NET Framework 4.8, который есть в любой Windows 10 1903+ и 11. Интерфейс собран кодом, без XAML, чтобы
// собираться обычным csc.exe из Windows без SDK (scripts/build-setup.cjs). Поэтому синтаксис C# 5: без $"" и ?.
// Ключи: --reinstall ставит заново, даже если стоит последняя версия; --dry всё как обычно, но без установки и запуска
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using System.Windows.Shell;
using Microsoft.Win32;

namespace SoundCloudSetup
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            bool created;
            using (var mutex = new Mutex(true, "SoundCloud2Setup", out created))
            {
                if (!created) return 0;
                ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
                bool dry = Array.IndexOf(args, "--dry") >= 0;
                bool reinstall = Array.IndexOf(args, "--reinstall") >= 0;
                var app = new Application();
                app.ShutdownMode = ShutdownMode.OnMainWindowClose;
                return app.Run(new SetupWindow(dry, reinstall));
            }
        }
    }

    static class L
    {
        public static readonly bool Ru = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ru";
        public static string S(string ru, string en) { return Ru ? ru : en; }
    }

    /// <summary>Что лежит в latest.yml последнего релиза</summary>
    class Release
    {
        public Version Version;
        public string Text;
        public string File;
        public string Sha512;
        public long Size;

        public static Release Fetch()
        {
            string yml = Net.GetString(Net.Latest("latest.yml"));
            var r = new Release();
            foreach (string raw in yml.Split('\n'))
            {
                string line = raw.TrimEnd('\r');
                string trimmed = line.Trim();
                if (line.StartsWith("version:")) r.Text = Value(line);
                else if (line.StartsWith("path:")) r.File = Value(line);
                else if (line.StartsWith("sha512:")) r.Sha512 = Value(line);
                else if (trimmed.StartsWith("size:") && r.Size == 0) long.TryParse(Value(trimmed), out r.Size);
            }
            if (r.Text == null || r.File == null || r.Sha512 == null) throw new InvalidDataException("latest.yml");
            r.Version = new Version(r.Text);
            r.File = System.IO.Path.GetFileName(r.File);
            return r;
        }

        static string Value(string line)
        {
            string v = line.Substring(line.IndexOf(':') + 1).Trim();
            return v.Trim('\'', '"');
        }
    }

    static class Net
    {
        public static string Latest(string file) { return "https://github.com/" + Build.Repo + "/releases/latest/download/" + Uri.EscapeDataString(file); }

        public static HttpWebRequest Request(string url)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "SoundCloud2-Setup/" + Build.Version;
            req.AllowAutoRedirect = true;
            req.Timeout = 30000;
            req.ReadWriteTimeout = 30000;
            return req;
        }

        public static string GetString(string url)
        {
            using (var res = Request(url).GetResponse())
            using (var reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                return reader.ReadToEnd();
        }
    }

    /// <summary>Установленный клиент из «Программ и компонентов»: запись деинсталлятора electron-builder</summary>
    class Installed
    {
        public Version Version;
        public string Text;
        public string Dir;
        public string Exe { get { return System.IO.Path.Combine(Dir, Build.Product + ".exe"); } }

        public static Installed Find()
        {
            foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
                foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                {
                    try
                    {
                        using (var root = RegistryKey.OpenBaseKey(hive, view))
                        using (var key = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + Build.Guid))
                        {
                            if (key == null) continue;
                            string un = key.GetValue("UninstallString") as string;
                            if (un == null) continue;
                            var found = new Installed();
                            found.Text = key.GetValue("DisplayVersion") as string ?? "";
                            Version.TryParse(found.Text, out found.Version);
                            found.Dir = key.GetValue("InstallLocation") as string;
                            // electron-builder пишет InstallLocation не всегда: тогда папка берётся из пути деинсталлятора
                            if (string.IsNullOrEmpty(found.Dir))
                            {
                                string exe = un.Trim();
                                if (exe.StartsWith("\"")) exe = exe.Substring(1, exe.IndexOf('"', 1) - 1);
                                found.Dir = System.IO.Path.GetDirectoryName(exe);
                            }
                            if (File.Exists(found.Exe)) return found;
                        }
                    }
                    catch (Exception) { }
                }
            return null;
        }
    }

    static class Ease
    {
        public static double Clamp(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
        public static double OutCubic(double t) { t = Clamp(t); return 1 - Math.Pow(1 - t, 3); }
        public static double OutBack(double t)
        {
            t = Clamp(t);
            const double c1 = 1.70158, c3 = c1 + 1;
            return 1 + c3 * Math.Pow(t - 1, 3) + c1 * Math.Pow(t - 1, 2);
        }
        public static double Damp(double rate, double dt) { return 1 - Math.Exp(-rate * dt); }
        public static Color Mix(Color a, Color b, double t)
        {
            return Color.FromArgb((byte)(a.A + (b.A - a.A) * t), (byte)(a.R + (b.R - a.R) * t), (byte)(a.G + (b.G - a.G) * t), (byte)(a.B + (b.B - a.B) * t));
        }
    }

    enum Phase { Check, Download, Install, Ready, Done, Error }

    class SetupWindow : Window
    {
        const double W = 520, H = 360, Pad = 22, TrackW = 340;
        const int Rays = 12;
        const double RayW = 7, RayInner = 15, RayMax = 31;
        // Длины лучей по кругу, как у звезды на картинках установщика: повторяются через четыре
        static readonly double[] Base = { 1, 0.62, 0.84, 0.48 };
        // Облако SoundCloud из рёбрышек: слева короткие полоски лесенкой, справа большой купол облака и малый на краю.
        // Высоты по профилю логотипа, низ у всех общий
        static readonly double[] Cloud = { 0.30, 0.36, 0.44, 0.40, 0.52, 0.48, 0.60, 0.70, 0.84, 0.94, 0.99, 1.0, 0.98, 0.92, 0.80, 0.74, 0.70, 0.62, 0.48 };
        const double BarW = 6, BarGap = 3.2, CloudH = 76;
        static readonly Color Orange = Color.FromRgb(0xFF, 0x55, 0x00);
        static readonly Color Gray = Color.FromRgb(0x5A, 0x5A, 0x5A);
        static readonly Color Bg = Color.FromRgb(0x12, 0x12, 0x12);

        readonly bool dry;
        readonly Stopwatch clock = Stopwatch.StartNew();
        double last, phaseStart;
        volatile Phase phase = Phase.Check;
        volatile bool cancel;
        bool closing;
        Release release;
        Installed installed;
        long got, total;

        // Анимируемое состояние: значения плавно догоняют цели каждого кадра, поэтому переходы между фазами без рывков
        double spinDrift, glow, shown, barTarget, cloudShow, sparkT;
        readonly double[] len = new double[Rays];
        readonly double[] alpha = new double[Rays];
        readonly Rectangle[] bars = new Rectangle[Cloud.Length];
        readonly ScaleTransform[] barScale = new ScaleTransform[Cloud.Length];
        readonly double[] barLen = new double[Cloud.Length];
        readonly TranslateTransform cloudMove = new TranslateTransform();
        readonly DropShadowEffect cloudGlow = new DropShadowEffect { Color = Orange, BlurRadius = 26, ShadowDepth = 0, Opacity = 0.5 };
        Canvas cloud, spark;
        Color tint = Orange;

        readonly Rectangle[] rays = new Rectangle[Rays];
        readonly ScaleTransform[] rayScale = new ScaleTransform[Rays];
        readonly SolidColorBrush rayBrush = new SolidColorBrush(Orange);
        readonly TranslateTransform sparkMove = new TranslateTransform();
        readonly RotateTransform sparkSpin = new RotateTransform();
        readonly ScaleTransform sparkScale = new ScaleTransform(0, 0);
        readonly DropShadowEffect sparkGlow = new DropShadowEffect { Color = Orange, BlurRadius = 26, ShadowDepth = 0, Opacity = 0.5 };
        readonly TranslateTransform wordMove = new TranslateTransform(0, 12);
        StackPanel word;
        Ellipse halo;
        TextBlock status, info;
        Border track;
        FrameworkElement fill;
        Rectangle shimmer;
        StackPanel buttons;
        Grid bottom;

        public SetupWindow(bool dry, bool reinstall)
        {
            this.dry = dry;
            Title = "SoundCloud 2";
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Width = W + Pad * 2;
            Height = H + Pad * 2;
            Opacity = 0;
            TaskbarItemInfo = new TaskbarItemInfo();
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            FontFamily = new FontFamily("Segoe UI Variable Display, Segoe UI");
            Content = Layout();

            Loaded += delegate
            {
                // Окно установщика выходит вперёд, даже если его запустили из браузера в фоне
                Topmost = true;
                Activate();
                Topmost = false;
                BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(260)));
                CompositionTarget.Rendering += Tick;
                Start(reinstall);
            };
            Closing += OnClosing;
        }

        // ---------- Вёрстка ----------

        UIElement Layout()
        {
            var card = new Border
            {
                Margin = new Thickness(Pad),
                CornerRadius = new CornerRadius(16),
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF)),
                BorderThickness = new Thickness(1),
                Effect = new DropShadowEffect { BlurRadius = 22, ShadowDepth = 4, Opacity = 0.45, Color = Colors.Black },
            };
            card.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { if (e.ButtonState == MouseButtonState.Pressed) try { DragMove(); } catch (InvalidOperationException) { } };

            var root = new Grid { ClipToBounds = true };
            root.Clip = new RectangleGeometry(new Rect(0, 0, W - 2, H - 2), 15, 15);
            card.Child = root;

            // Тёплое свечение снизу, дышит; на «Готово» разгорается
            halo = new Ellipse
            {
                Width = 700, Height = 330,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(-200, 0, -200, -215),
                IsHitTestVisible = false,
            };
            var hb = new RadialGradientBrush();
            hb.GradientStops.Add(new GradientStop(Color.FromArgb(0x70, 0xFF, 0x55, 0x00), 0));
            hb.GradientStops.Add(new GradientStop(Color.FromArgb(0x22, 0xFF, 0x33, 0x00), 0.55));
            hb.GradientStops.Add(new GradientStop(Color.FromArgb(0x00, 0xFF, 0x33, 0x00), 1));
            halo.Fill = hb;
            root.Children.Add(halo);

            root.Children.Add(TitleBar());

            var center = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 54, 0, 0) };
            center.Children.Add(Spark());
            word = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 10, 0, 0), Opacity = 0, RenderTransform = wordMove };
            word.Children.Add(new TextBlock { Text = "SoundCloud", FontSize = 38, FontWeight = FontWeights.SemiBold, Foreground = Brushes.White });
            word.Children.Add(new TextBlock { Text = "2", FontSize = 38, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Orange), Margin = new Thickness(9, 0, 0, 0) });
            center.Children.Add(word);
            info = new TextBlock { FontSize = 13, Foreground = new SolidColorBrush(Color.FromRgb(0x8C, 0x8C, 0x8C)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 0), Opacity = 0 };
            center.Children.Add(info);
            root.Children.Add(center);

            bottom = new Grid { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 30), Height = 58 };
            status = new TextBlock { FontSize = 13, Foreground = new SolidColorBrush(Color.FromRgb(0xC4, 0xC4, 0xC4)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Top };
            bottom.Children.Add(status);

            track = new Border { Width = TrackW, Height = 4, CornerRadius = new CornerRadius(2), Background = new SolidColorBrush(Color.FromRgb(0x2A, 0x2A, 0x2A)), VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 10), ClipToBounds = true };
            var fillGrid = new Canvas { ClipToBounds = true, HorizontalAlignment = HorizontalAlignment.Left, Width = 0, Height = 4 };
            var fb = new LinearGradientBrush(Color.FromRgb(0xFF, 0x88, 0x00), Color.FromRgb(0xFF, 0x33, 0x00), 0);
            var fillBar = new Border { CornerRadius = new CornerRadius(2), Background = fb, Height = 4 };
            fillBar.SetBinding(WidthProperty, new System.Windows.Data.Binding("Width") { Source = fillGrid });
            fillGrid.Children.Add(fillBar);
            var sb = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
            sb.GradientStops.Add(new GradientStop(Color.FromArgb(0, 255, 255, 255), 0));
            sb.GradientStops.Add(new GradientStop(Color.FromArgb(0xA0, 255, 240, 220), 0.5));
            sb.GradientStops.Add(new GradientStop(Color.FromArgb(0, 255, 255, 255), 1));
            shimmer = new Rectangle { Width = 90, Height = 4, Fill = sb };
            fillGrid.Children.Add(shimmer);
            fill = fillGrid;
            track.Child = fillGrid;
            bottom.Children.Add(track);

            buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom, Visibility = Visibility.Collapsed };
            bottom.Children.Add(buttons);
            root.Children.Add(bottom);

            return card;
        }

        UIElement TitleBar()
        {
            var bar = new DockPanel { VerticalAlignment = VerticalAlignment.Top, Height = 40, LastChildFill = false };
            var close = ChromeButton("", delegate { Close(); });
            DockPanel.SetDock(close, Dock.Right);
            bar.Children.Add(close);
            var min = ChromeButton("", delegate { WindowState = WindowState.Minimized; });
            DockPanel.SetDock(min, Dock.Right);
            bar.Children.Add(min);
            var egg = new TextBlock { Text = "// sound claude", FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x3A, 0x3A, 0x3A)), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(18, 0, 0, 0) };
            DockPanel.SetDock(egg, Dock.Left);
            bar.Children.Add(egg);
            return bar;
        }

        FrameworkElement ChromeButton(string glyph, Action click)
        {
            var normal = new SolidColorBrush(Color.FromRgb(0x80, 0x80, 0x80));
            var b = new Border { Width = 46, Height = 40, Background = Brushes.Transparent, Cursor = Cursors.Hand };
            var t = new TextBlock { Text = glyph, FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"), FontSize = 10, Foreground = normal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            b.Child = t;
            b.MouseEnter += delegate { t.Foreground = Brushes.White; b.Background = new SolidColorBrush(Color.FromArgb(0x14, 0xFF, 0xFF, 0xFF)); };
            b.MouseLeave += delegate { t.Foreground = normal; b.Background = Brushes.Transparent; };
            b.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; };
            b.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; click(); };
            return b;
        }

        // Облако из рёбрышек (проверка, загрузка) и звезда из двенадцати столбиков (установка, финиш) в одном месте.
        // Рёбрышки растут от общего низа, лучи звезды от внутреннего конца
        UIElement Spark()
        {
            double size = (RayInner + RayMax) * 2 + 10;
            var lane = new Canvas { Width = 240, Height = size };

            double cw = Cloud.Length * (BarW + BarGap) - BarGap;
            cloud = new Canvas { Width = cw, Height = CloudH, Effect = cloudGlow, RenderTransform = cloudMove };
            Canvas.SetLeft(cloud, (240 - cw) / 2);
            Canvas.SetTop(cloud, (size - CloudH) / 2 + 4);
            for (int i = 0; i < Cloud.Length; i++)
            {
                var b = new Rectangle { Width = BarW, Height = CloudH, RadiusX = BarW / 2, RadiusY = BarW / 2, Fill = rayBrush };
                Canvas.SetLeft(b, i * (BarW + BarGap));
                barScale[i] = new ScaleTransform(1, 0, BarW / 2, CloudH);
                b.RenderTransform = barScale[i];
                bars[i] = b;
                cloud.Children.Add(b);
            }
            lane.Children.Add(cloud);

            spark = new Canvas { Width = size, Height = size, Effect = sparkGlow, Opacity = 0 };
            Canvas.SetLeft(spark, (240 - size) / 2);
            var g = new TransformGroup();
            g.Children.Add(sparkScale);
            g.Children.Add(sparkSpin);
            g.Children.Add(sparkMove);
            sparkScale.CenterX = sparkScale.CenterY = sparkSpin.CenterX = sparkSpin.CenterY = size / 2;
            spark.RenderTransform = g;
            double c = size / 2;
            for (int i = 0; i < Rays; i++)
            {
                var r = new Rectangle { Width = RayW, Height = RayMax, RadiusX = RayW / 2, RadiusY = RayW / 2, Fill = rayBrush };
                Canvas.SetLeft(r, c - RayW / 2);
                Canvas.SetTop(r, c - RayInner - RayMax);
                var tg = new TransformGroup();
                rayScale[i] = new ScaleTransform(1, 0, RayW / 2, RayMax);
                tg.Children.Add(rayScale[i]);
                tg.Children.Add(new RotateTransform(i * 360.0 / Rays, RayW / 2, RayMax + RayInner));
                r.RenderTransform = tg;
                rays[i] = r;
                alpha[i] = 1;
                spark.Children.Add(r);
            }
            lane.Children.Add(spark);
            return lane;
        }

        Border Button(string text, bool primary, Action click)
        {
            var bg = primary ? new SolidColorBrush(Orange) : new SolidColorBrush(Color.FromRgb(0x26, 0x26, 0x26));
            var hover = primary ? new SolidColorBrush(Color.FromRgb(0xFF, 0x6E, 0x22)) : new SolidColorBrush(Color.FromRgb(0x33, 0x33, 0x33));
            var b = new Border { CornerRadius = new CornerRadius(18), Background = bg, Padding = new Thickness(22, 8, 22, 9), Margin = new Thickness(6, 0, 6, 0), Cursor = Cursors.Hand };
            b.Child = new TextBlock { Text = text, FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = primary ? Brushes.White : new SolidColorBrush(Color.FromRgb(0xDD, 0xDD, 0xDD)) };
            b.MouseEnter += delegate { b.Background = hover; };
            b.MouseLeave += delegate { b.Background = bg; };
            b.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; };
            b.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; click(); };
            return b;
        }

        // ---------- Кадр ----------

        void Tick(object sender, EventArgs e)
        {
            double now = clock.Elapsed.TotalSeconds;
            double dt = Math.Min(0.05, now - last);
            last = now;
            double pt = now - phaseStart;
            double k = Ease.Damp(5, dt), kFast = Ease.Damp(16, dt);
            Phase p = phase;

            double wordIn = Ease.OutCubic((now - 0.35) / 0.6);
            word.Opacity = wordIn;
            wordMove.Y = 12 * (1 - wordIn);
            info.Opacity = Ease.OutCubic((now - 0.55) / 0.6);

            // Облако на проверке и загрузке, звезда на установке: на смене рёбрышки опадают слева направо,
            // а звезда выпрыгивает с поворотом
            bool cloudPhase = p == Phase.Check || p == Phase.Download || p == Phase.Ready || p == Phase.Error;
            cloudShow += ((cloudPhase ? 1 : 0) - cloudShow) * Ease.Damp(4, dt);
            sparkT = cloudPhase ? Math.Max(0, sparkT - dt * 2) : sparkT + dt;
            double pop = Ease.OutBack(sparkT / 0.7);
            sparkScale.ScaleX = sparkScale.ScaleY = pop * (p == Phase.Done ? 1 + 0.12 * Math.Sin(Math.Min(pt / 0.5, 1) * Math.PI) : 1);
            spark.Opacity = Ease.Clamp(sparkT / 0.25);

            // Рёбрышки медленно ходят туда-сюда: волна высоты прокатывается по облаку то вправо, то влево,
            // и само облако чуть плывёт. На загрузке рёбрышки слева направо загораются по ходу скачивания
            double sweep = 2.6 * Math.Sin(now * 0.7);
            double done = p == Phase.Download ? shown / 0.82 * Cloud.Length : Cloud.Length;
            cloudMove.X = 9 * Math.Sin(now * 0.5);
            for (int i = 0; i < Cloud.Length; i++)
            {
                double wave = 0.84 + 0.16 * Math.Sin(i * 0.55 - sweep);
                double target = Cloud[i] * wave * (p == Phase.Error ? 0.45 : 1);
                double grow = Ease.OutCubic((now - 0.1 - i * 0.03) / 0.55);
                double vis = Ease.OutCubic(cloudShow * 1.6 - (double)i / Cloud.Length * 0.6);
                barLen[i] += (target - barLen[i]) * Ease.Damp(6, dt);
                barScale[i].ScaleY = Math.Max(0.001, barLen[i] * grow * vis);
                bars[i].Opacity = p == Phase.Download ? 0.3 + 0.7 * Ease.Clamp(done - i) : 1;
            }
            cloud.Opacity = Ease.Clamp(cloudShow * 1.5);

            double spinSpeed = p == Phase.Install ? 300 : p == Phase.Done ? Math.Max(0, 300 * (1 - pt / 1.2)) : 0;
            spinDrift += spinSpeed * dt;
            sparkSpin.Angle = spinDrift - 140 * (1 - Ease.OutCubic(sparkT / 0.8));

            // Лучи: на загрузке прыгают как эквалайзер, на установке бежит волна по кругу, на финише раскрываются
            double head = now * 15;
            for (int i = 0; i < Rays; i++)
            {
                double target, a = 1;
                switch (p)
                {
                    case Phase.Download:
                        double v = 0.5 + 0.28 * Math.Sin(now * 5.3 + i * 2.1) + 0.22 * Math.Sin(now * 8.7 + i * 0.7 + 1.3);
                        target = 0.28 + 0.72 * Ease.Clamp(v);
                        break;
                    case Phase.Install:
                        double d = ((head - i) % Rays + Rays) % Rays;
                        double f = Math.Exp(-d * 0.55);
                        target = 0.42 + 0.58 * f;
                        a = 0.35 + 0.65 * f;
                        break;
                    case Phase.Done: target = 1; break;
                    case Phase.Error: target = 0.3 + 0.06 * Math.Sin(now * 2 + i); break;
                    default: target = Base[i % 4] * (0.88 + 0.12 * Math.Sin(now * 2.4 + i * 0.8)); break;
                }
                double grow = Ease.OutCubic((sparkT - 0.1 - i * 0.03) / 0.45);
                len[i] += (target - len[i]) * kFast;
                alpha[i] += (a - alpha[i]) * kFast;
                rayScale[i].ScaleY = Math.Max(0.001, len[i] * grow);
                rays[i].Opacity = alpha[i];
            }
            tint = Ease.Mix(tint, p == Phase.Error ? Gray : Orange, k);
            rayBrush.Color = tint;

            double glowTarget = p == Phase.Done ? 1 : p == Phase.Error ? 0.15 : 0.55 + 0.12 * Math.Sin(now * 1.1);
            glow += (glowTarget - glow) * Ease.Damp(3, dt);
            halo.Opacity = glow * Ease.OutCubic(now / 1.2);
            sparkGlow.Opacity = cloudGlow.Opacity = 0.25 + 0.45 * glow;
            sparkGlow.BlurRadius = cloudGlow.BlurRadius = 18 + 22 * glow;

            // Полоса: загрузка занимает 0..82%, установка оставшееся; на установке прогресс оценочный
            if (p == Phase.Download)
            {
                long t = Interlocked.Read(ref total), g = Interlocked.Read(ref got);
                barTarget = t > 0 ? 0.82 * g / t : 0;
                SetStatus(DownloadText(g, t));
            }
            else if (p == Phase.Install) barTarget = 0.82 + 0.17 * (1 - Math.Exp(-pt / 5));
            else if (p == Phase.Done) barTarget = 1;
            shown += (barTarget - shown) * Ease.Damp(6, dt);
            fill.Width = TrackW * shown;
            double run = fill.Width + 180;
            Canvas.SetLeft(shimmer, (now * 240) % run - 90);
            shimmer.Visibility = p == Phase.Download || p == Phase.Install ? Visibility.Visible : Visibility.Hidden;

            if (p == Phase.Download || p == Phase.Install)
            {
                TaskbarItemInfo.ProgressState = TaskbarItemProgressState.Normal;
                TaskbarItemInfo.ProgressValue = shown;
            }
            else if (p == Phase.Error) TaskbarItemInfo.ProgressState = TaskbarItemProgressState.Error;
            else TaskbarItemInfo.ProgressState = TaskbarItemProgressState.None;

            if (p == Phase.Done && pt > 1.6 && !closing) FadeOut();
        }

        static string DownloadText(long g, long t)
        {
            string name = L.S("Скачивание SoundCloud 2…", "Downloading SoundCloud 2…");
            if (t <= 0) return name;
            int pct = (int)(100 * g / t);
            return name + " " + pct + "% (" + Mb(g) + L.S(" из ", " of ") + Mb(t) + L.S(" МБ)", " MB)");
        }

        static string Mb(long bytes) { return ((int)Math.Round(bytes / 1048576.0)).ToString(CultureInfo.InvariantCulture); }

        void SetStatus(string text)
        {
            if (status.Text == text) return;
            bool soft = status.Text.Length == 0 || !status.Text.StartsWith(text.Substring(0, Math.Min(8, text.Length)));
            status.Text = text;
            if (soft) status.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(280)));
        }

        void SetPhase(Phase p)
        {
            phase = p;
            phaseStart = clock.Elapsed.TotalSeconds;
            bool showTrack = p == Phase.Check || p == Phase.Download || p == Phase.Install || p == Phase.Done;
            track.Visibility = showTrack ? Visibility.Visible : Visibility.Collapsed;
            buttons.Visibility = showTrack ? Visibility.Collapsed : Visibility.Visible;
            if (!showTrack) buttons.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(300)));
        }

        void Ui(Action a) { Dispatcher.BeginInvoke(a); }

        // ---------- Работа ----------

        void Start(bool force)
        {
            cancel = false;
            got = total = 0;
            barTarget = 0;
            buttons.Children.Clear();
            SetPhase(Phase.Check);
            SetStatus(L.S("Проверяем последнюю версию…", "Checking for the latest version…"));
            var thread = new Thread(delegate() { Work(force); }) { IsBackground = true };
            thread.Start();
        }

        void Work(bool force)
        {
            string stage = "check";
            try
            {
                release = Release.Fetch();
                installed = Installed.Find();
                if (!force && installed != null && installed.Version != null && installed.Version >= release.Version)
                {
                    Ui(ShowReady);
                    return;
                }
                Ui(delegate
                {
                    if (installed == null) info.Text = L.S("Версия ", "Version ") + release.Text;
                    else if (installed.Text == release.Text) info.Text = L.S("Переустановка ", "Reinstalling ") + release.Text;
                    else info.Text = L.S("Обновление ", "Update ") + installed.Text + "  →  " + release.Text;
                    total = release.Size;
                    SetPhase(Phase.Download);
                });
                stage = "download";
                string file = Download();
                if (cancel) return;
                stage = "install";
                Ui(delegate { SetPhase(Phase.Install); SetStatus(L.S("Установка…", "Installing…")); });
                Install(file);
                Ui(delegate
                {
                    SetPhase(Phase.Done);
                    SetStatus(L.S("Готово. Запускаем SoundCloud 2", "Done. Starting SoundCloud 2"));
                    Launch();
                });
            }
            catch (Exception ex)
            {
                if (cancel) return;
                string where = stage;
                string detail = ex.Message;
                Ui(delegate { ShowError(where, detail); });
            }
        }

        string Download()
        {
            string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "SoundCloud2Setup");
            Directory.CreateDirectory(dir);
            string file = System.IO.Path.Combine(dir, release.File);
            // Уже скачанный и целый файл с прошлого раза не качаем заново
            if (File.Exists(file) && Hash(file) == release.Sha512)
            {
                Interlocked.Exchange(ref total, new FileInfo(file).Length);
                Interlocked.Exchange(ref got, new FileInfo(file).Length);
                return file;
            }
            string part = file + ".part";
            try
            {
                using (var sha = SHA512.Create())
                using (var res = (HttpWebResponse)Net.Request(Net.Latest(release.File)).GetResponse())
                using (var input = res.GetResponseStream())
                using (var output = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16))
                {
                    if (res.ContentLength > 0) Interlocked.Exchange(ref total, res.ContentLength);
                    var buf = new byte[1 << 16];
                    int n;
                    long sum = 0;
                    while ((n = input.Read(buf, 0, buf.Length)) > 0)
                    {
                        if (cancel) throw new OperationCanceledException();
                        output.Write(buf, 0, n);
                        sha.TransformBlock(buf, 0, n, null, 0);
                        sum += n;
                        Interlocked.Exchange(ref got, sum);
                    }
                    sha.TransformFinalBlock(new byte[0], 0, 0);
                    if (Convert.ToBase64String(sha.Hash) != release.Sha512) throw new InvalidDataException(L.S("файл пришёл повреждённым", "the file arrived damaged"));
                }
                if (File.Exists(file)) File.Delete(file);
                File.Move(part, file);
                return file;
            }
            finally
            {
                if (File.Exists(part)) try { File.Delete(part); } catch (Exception) { }
            }
        }

        static string Hash(string file)
        {
            using (var sha = SHA512.Create())
            using (var s = File.OpenRead(file))
                return Convert.ToBase64String(sha.ComputeHash(s));
        }

        void Install(string file)
        {
            if (dry) { Thread.Sleep(4000); return; }
            // Тихая установка полного установщика electron-builder: без страниц, клиент закрывается сам, если открыт
            var p = Process.Start(new ProcessStartInfo(file, "/S") { UseShellExecute = false });
            p.WaitForExit();
            if (p.ExitCode != 0) throw new Exception(L.S("код ", "code ") + p.ExitCode);
            try { File.Delete(file); } catch (Exception) { }
        }

        void Launch()
        {
            if (dry) return;
            var app = Installed.Find();
            if (app == null) return;
            try { Process.Start(new ProcessStartInfo(app.Exe) { UseShellExecute = true, WorkingDirectory = app.Dir }); }
            catch (Exception) { }
        }

        void ShowReady()
        {
            info.Text = L.S("Стоит последняя версия ", "Latest version installed: ") + installed.Text;
            SetStatus("");
            buttons.Children.Clear();
            buttons.Children.Add(Button(L.S("Открыть", "Open"), true, delegate
            {
                SetPhase(Phase.Done);
                barTarget = 1;
                SetStatus(L.S("Запускаем SoundCloud 2", "Starting SoundCloud 2"));
                Launch();
            }));
            buttons.Children.Add(Button(L.S("Переустановить", "Reinstall"), false, delegate { Start(true); }));
            SetPhase(Phase.Ready);
        }

        void ShowError(string stage, string detail)
        {
            info.Text = detail.Length > 70 ? detail.Substring(0, 70) + "…" : detail;
            SetStatus(stage == "install"
                ? L.S("Установка не прошла", "Installation failed")
                : stage == "check"
                    ? L.S("Не получилось связаться с GitHub. Проверь интернет", "Couldn't reach GitHub. Check your connection")
                    : L.S("Загрузка прервалась", "The download stopped"));
            buttons.Children.Clear();
            buttons.Children.Add(Button(L.S("Повторить", "Try again"), true, delegate { Start(false); }));
            SetPhase(Phase.Error);
        }

        void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            // Посреди установки окно не закрывается: полный установщик уже пишет файлы
            if (phase == Phase.Install) { e.Cancel = true; return; }
            cancel = true;
            if (!closing)
            {
                e.Cancel = true;
                FadeOut();
            }
        }

        void FadeOut()
        {
            closing = true;
            var a = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(320));
            a.Completed += delegate { CompositionTarget.Rendering -= Tick; Application.Current.Shutdown(); };
            BeginAnimation(OpacityProperty, a);
        }
    }
}
