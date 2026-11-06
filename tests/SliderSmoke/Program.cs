using YuiTracking;

static void Check(bool ok, string name) { if (!ok) throw new Exception(name); Console.WriteLine("PASS " + name); }

Check(SliderMath.Step(1, .1, 0, 3) == 1.1, "plus adds one step");
Check(SliderMath.Step(1, -.1, 0, 3) == .9, "minus removes one step");
var value = 1d;
for (var i = 0; i < 10; i++) value = SliderMath.Step(value, .1, 0, 3);
Check(value == 2, "repeated steps do not drift");
Check(SliderMath.Step(2.95, .1, 0, 3) == 3, "plus stops at the maximum");
Check(SliderMath.Step(.05, -.1, 0, 3) == 0, "minus stops at the minimum");
Check(SliderMath.FromDisplay(65, 100, 0, .95) == .65, "percent entry converts to the slider value");
Check(SliderMath.FromDisplay(500, 100, 0, .95) == .95, "entry above the maximum is limited");
Check(SliderMath.FromDisplay(-500, 1, -100, 100) == -100, "entry below the minimum is limited");
Check(ScrollThumbMath.CanScroll(500, 1500) && !ScrollThumbMath.CanScroll(500, 500), "thumb appears only when content overflows");
Check(ScrollThumbMath.ThumbHeight(600, 500, 1000) == 300, "thumb size follows the visible share");
Check(ScrollThumbMath.ThumbHeight(600, 100, 100000) == 32, "thumb keeps a usable minimum size");
Check(ScrollThumbMath.ThumbTop(0, 600, 500, 1000) == 0 && ScrollThumbMath.ThumbTop(500, 600, 500, 1000) == 300, "thumb reaches both ends of the track");
Check(ScrollThumbMath.OffsetFromThumbTop(150, 600, 500, 1000) == 250, "dragging the thumb maps to the scroll offset");
Check(ScrollThumbMath.OffsetFromThumbTop(-50, 600, 500, 1000) == 0 && ScrollThumbMath.OffsetFromThumbTop(900, 600, 500, 1000) == 500, "dragging past the ends is limited");
var used = VrmHistory.WithUsed(new[] { @"C:\a.vrm", @"C:\b.vrm" }, @"C:\B.VRM");
Check(used.Count == 2 && used[0] == @"C:\B.VRM" && used[1] == @"C:\a.vrm", "reopening a VRM moves it first without duplicating");
Check(VrmHistory.WithUsed(Enumerable.Range(0, 40).Select(i => $@"C:\{i}.vrm"), @"C:\new.vrm").Count == VrmHistory.MaximumEntries, "history keeps a limited number of entries");
Check(VrmHistory.Without(used, @"C:\A.vrm").Count == 1, "removing ignores letter case");
Check(VrmHistory.ThumbnailFileName(@"C:\A.vrm") == VrmHistory.ThumbnailFileName(@"c:\a.VRM") && !VrmHistory.ThumbnailFileName(@"C:\a.vrm").Contains('\\'), "thumbnail name is stable and safe");
var png = "data:image/png;base64," + Convert.ToBase64String(new byte[] { 0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10 });
Check(VrmHistory.DecodeThumbnail(png)?.Length == 8, "PNG thumbnail is accepted");
Check(VrmHistory.DecodeThumbnail("data:text/html;base64,AAAA") == null && VrmHistory.DecodeThumbnail("data:image/png;base64,###") == null && VrmHistory.DecodeThumbnail("data:image/png;base64,AAAAAAAAAAA=") == null, "other data is rejected");
