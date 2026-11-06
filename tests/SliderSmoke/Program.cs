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
static Dictionary<string, double> V(double a) => new() { ["a"] = a, ["b"] = 2 };
var list = MotionPresets.Added(new List<MotionPreset>(), new MotionPreset(" 配信 ", "camera", V(1)));
Check(list.Count == 1 && list[0].Name == "配信", "added preset keeps a trimmed name");
Check(MotionPresets.NameProblem(list, "  ") != null && MotionPresets.NameProblem(list, new string('あ', 21)) != null, "empty and long names are rejected");
Check(MotionPresets.NameProblem(list, "配信") != null && MotionPresets.NameProblem(list, "雑談") == null, "duplicate names are rejected");
Check(MotionPresets.NameProblem(list, "配信", "配信") == null, "renaming may keep its own name");
Check(MotionPresets.NextName(list) == "プリセット2", "next name counts existing presets");
Check(MotionPresets.Matches(list[0], "camera", V(1.0002)) && !MotionPresets.Matches(list[0], "camera", V(1.1)) && !MotionPresets.Matches(list[0], "fixed", V(1)), "match needs the same values and gaze mode");
Check(MotionPresets.Matches(list[0], "camera", new Dictionary<string, double>(V(1)) { ["newer"] = 9 }), "settings newer than the preset do not break a match");
var changed = MotionPresets.Overwritten(list, "配信", "fixed", V(3));
Check(changed[0].GazeMode == "fixed" && changed[0].Values["a"] == 3 && changed[0].Name == "配信", "overwrite keeps the name");
Check(MotionPresets.Renamed(list, "配信", " 雑談 ")[0].Name == "雑談", "rename trims the new name");
Check(MotionPresets.Without(list, "配信").Count == 0, "delete removes the preset");
var saved = System.Text.Json.JsonSerializer.Serialize(list);
var loaded = System.Text.Json.JsonSerializer.Deserialize<List<MotionPreset>>(saved)!;
Check(loaded[0].Name == "配信" && loaded[0].GazeMode == "camera" && loaded[0].Values["b"] == 2, "presets survive saving and loading");
var withOff = new MotionPreset("x", "camera", V(1), new List<string> { "b" });
Check(MotionPresets.Matches(withOff, "camera", V(1), new[] { "b" }) && !MotionPresets.Matches(withOff, "camera", V(1)) && !MotionPresets.Matches(withOff, "camera", V(1), new[] { "a" }), "match includes which sliders are off");
Check(MotionPresets.Matches(new MotionPreset("old", "camera", V(1)), "camera", V(1)), "an older preset without the list means all on");
Check(MotionPresets.Overwritten(new[] { withOff }, "x", "camera", V(1), new List<string> { "a" })[0].Disabled![0] == "a", "overwrite saves which sliders are off");
var offLoaded = System.Text.Json.JsonSerializer.Deserialize<MotionPreset>(System.Text.Json.JsonSerializer.Serialize(withOff))!;
Check(offLoaded.Disabled![0] == "b", "the off list survives saving and loading");
const string sharedFile = """
{"format":"yuitracking-preset","version":1,"name":"配信","gazeMode":"camera","values":{"smoothing":0.5,"sideTiltStrength":2,"unknownKey":9},"disabled":["sideTiltStrength","unknownKey"]}
""";
var imported = PresetFile.Parsed(sharedFile);
Check(imported.Name == "配信" && imported.GazeMode == "camera" && imported.Values.Count == 2 && imported.Values["sideTiltStrength"] == 2 && imported.Disabled!.SequenceEqual(new[] { "sideTiltStrength" }), "a preset file keeps known values and drops unknown ones");
var written = PresetFile.Parsed(PresetFile.Serialized(new MotionPreset("雑談", "fixed", new Dictionary<string, double> { ["smoothing"] = .25 }, new List<string> { "smoothing" })));
Check(written.Name == "雑談" && written.GazeMode == "fixed" && written.Values["smoothing"] == .25 && written.Disabled![0] == "smoothing", "a preset file survives writing and reading");
Check(PresetFile.Serialized(written).Contains("雑談"), "preset files keep Japanese names readable");
bool Rejected(string text, string message) { try { PresetFile.Parsed(text); return false; } catch (InvalidDataException ex) { return ex.Message.Contains(message); } }
Check(new[] { "", "[]", "{}", "not json", "{\"format\":\"other\",\"version\":1}", sharedFile.Replace("\"version\":1", "\"version\":\"1\""), sharedFile.Replace("\"camera\"", "\"other\""), sharedFile.Replace("\"配信\"", "\"  \""), "{\"format\":\"yuitracking-preset\",\"version\":1,\"name\":\"a\",\"gazeMode\":\"camera\",\"values\":{\"unknown\":1}}", "{\"format\":\"yuitracking-preset\",\"version\":1,\"name\":\"a\",\"gazeMode\":\"camera\",\"values\":{\"smoothing\":\"1\"}}" }.All(text => Rejected(text, "読み込めません")), "broken preset files are rejected");
Check(Rejected(sharedFile.Replace("\"version\":1", "\"version\":2"), "新しいバージョン"), "preset files from a newer format are refused");
Check(PresetFile.Parsed(PresetFile.Serialized(new MotionPreset(new string('あ', 30), "camera", new Dictionary<string, double> { ["smoothing"] = 1 }))).Name.Length == 20, "long names are shortened on import");
var takenNames = new[] { new MotionPreset("配信", "camera", V(1)), new MotionPreset("配信 (2)", "camera", V(1)) };
Check(PresetFile.UniqueName(takenNames, "雑談") == "雑談" && PresetFile.UniqueName(takenNames, "配信") == "配信 (3)", "imported names never collide");
Check(PresetFile.UniqueName(new[] { new MotionPreset(new string('あ', 20), "camera", V(1)) }, new string('あ', 20)) == new string('あ', 16) + " (2)", "numbered names still fit the limit");
Check(PresetFile.FileName("配信") == "配信.json" && PresetFile.FileName("a/b:c*") == "a_b_c_.json" && PresetFile.FileName("...") == "preset.json", "file names avoid characters Windows refuses");
