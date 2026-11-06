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
