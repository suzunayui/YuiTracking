using System.IO.MemoryMappedFiles;
using HoloTrack;
if(args.Contains("--cadence"))
{
    var slot="Perf_"+Guid.NewGuid().ToString("N");
    using var perfMutex=new Mutex(false,"UnityCapture_Mutx"+slot);
    using var perfSent=new EventWaitHandle(false,EventResetMode.AutoReset,"UnityCapture_Sent"+slot);
    using var perfMemory=MemoryMappedFile.CreateOrOpen("UnityCapture_Data"+slot,32L+VirtualCamera.FrameBytes);
    using var perfView=perfMemory.CreateViewAccessor();perfView.Write(0,(uint)VirtualCamera.FrameBytes);
    using var camera=new VirtualCamera(slot);
    var clock=System.Diagnostics.Stopwatch.StartNew();var intervals=new List<double>();double previous=0;
    while(clock.Elapsed.TotalSeconds<5){if(!perfSent.WaitOne(1000))throw new Exception("Output stalled");var now=clock.Elapsed.TotalMilliseconds;if(previous>0)intervals.Add(now-previous);previous=now;}
    intervals.Sort();Console.WriteLine($"Output {intervals.Count/(clock.Elapsed.TotalSeconds):F1} fps; median {intervals[intervals.Count/2]:F1} ms; p95 {intervals[(int)(intervals.Count*.95)]:F1} ms; max {intervals[^1]:F1} ms");
    return;
}
if (args.Contains("--register"))
{
    VirtualCamera.Register(Path.GetFullPath("src/HoloTrack.App/Assets/VirtualCamera/UnityCaptureFilter64.dll"));
    Console.WriteLine("Registered YuiTracking Camera for the current user."); return;
}
if (args.Contains("--send"))
{
    using var camera = new VirtualCamera();
    var pixels = VirtualCamera.CreateStandby();
    for (var p=0;p<pixels.Length;p+=4) { pixels[p]=230; pixels[p+1]=40; pixels[p+2]=90; }
    for (int i=0;i<200;i++) { camera.Submit(pixels); Thread.Sleep(50); }
    Console.WriteLine(camera.Status); return;
}
var channel = "Test_"+Guid.NewGuid().ToString("N");
using var mutex = new Mutex(false,"UnityCapture_Mutx"+channel);
using var sent = new EventWaitHandle(false,EventResetMode.AutoReset,"UnityCapture_Sent"+channel);
using var memory = MemoryMappedFile.CreateOrOpen("UnityCapture_Data"+channel,32L+VirtualCamera.FrameBytes);
using var view = memory.CreateViewAccessor();view.Write(0,(uint)VirtualCamera.FrameBytes);
using var sender = new VirtualCamera(channel);
void Check(bool pass,string message) { if(!pass)throw new Exception(message);Console.WriteLine("PASS "+message); }
void Next() { sent.WaitOne(1000);Thread.Sleep(100); }
Next();Check(view.ReadInt32(4)==1280&&view.ReadInt32(8)==720,"1280x720 protocol header");
Check(view.ReadByte(32)==23,"startup emits standby");
var frame = new byte[VirtualCamera.FrameBytes];Array.Fill(frame,(byte)123);sender.Submit(frame);Next();
Check(view.ReadByte(32)==123,"render frame reaches receiver");
sender.SetPrivacy(true);Next();Check(view.ReadByte(32)==23,"privacy immediately replaces avatar");
sender.SetPrivacy(false);Next();Check(view.ReadByte(32)==23,"privacy release rejects old frame");
sender.Submit(frame);Thread.Sleep(850);Next();Check(view.ReadByte(32)==23,"stalled renderer returns to standby");
frame[0]=17;frame[(VirtualCamera.Height-1)*VirtualCamera.Width*4]=91;sender.Submit(frame);Next();
Check(view.ReadByte(32)==91&&view.ReadByte(32+(VirtualCamera.Height-1)*VirtualCamera.Width*4)==17,"top-down canvas becomes bottom-up DirectShow image");
try { sender.Submit(new byte[3]);throw new Exception("Malformed frame accepted"); }catch(ArgumentException){Console.WriteLine("PASS malformed frame rejected");}
sender.Submit(frame);Next();sender.Dispose();Check(view.ReadByte(32)==23,"shutdown overwrites the last frame");
