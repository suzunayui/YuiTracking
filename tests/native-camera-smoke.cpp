// Loads the built DLL directly. No camera registration or production slot is changed.
#include "../native/UnityCapture/shared.inl"
#include <dshow.h>
#include <wrl/client.h>
#include <vector>
#include <cstdio>
#include <algorithm>
using Microsoft::WRL::ComPtr;
MIDL_INTERFACE("6B652FFF-11FE-4fce-92AD-0266B5D7C78F") Grabber : IUnknown {
 virtual HRESULT STDMETHODCALLTYPE SetOneShot(BOOL)=0;
 virtual HRESULT STDMETHODCALLTYPE SetMediaType(const AM_MEDIA_TYPE*)=0;
 virtual HRESULT STDMETHODCALLTYPE GetConnectedMediaType(AM_MEDIA_TYPE*)=0;
 virtual HRESULT STDMETHODCALLTYPE SetBufferSamples(BOOL)=0;
 virtual HRESULT STDMETHODCALLTYPE GetCurrentBuffer(long*,long*)=0;
 virtual HRESULT STDMETHODCALLTYPE GetCurrentSample(IMediaSample**)=0;
 virtual HRESULT STDMETHODCALLTYPE SetCallback(IUnknown*,long)=0;
};
static void Check(HRESULT hr,const char* step){if(FAILED(hr)){printf("FAIL %s: %08lx\n",step,hr);exit(1);}}
static ComPtr<IPin> Pin(IBaseFilter* filter,PIN_DIRECTION direction){
 ComPtr<IEnumPins> pins;Check(filter->EnumPins(&pins),"EnumPins");ComPtr<IPin> pin;
 while(pins->Next(1,&pin,nullptr)==S_OK){PIN_DIRECTION d;pin->QueryDirection(&d);if(d==direction)return pin;pin.Reset();}
 puts("FAIL missing pin");exit(1);
}
int wmain(int argc,wchar_t** argv){
 if(argc!=2&&argc!=3)return 2; const int bpp=argc==3?3:4;
 Check(CoInitializeEx(nullptr,COINIT_MULTITHREADED),"COM");
 // Slot 60 ('l') is test-only; refuse to share a live sender's channel.
 HANDLE existing=OpenEventA(SYNCHRONIZE,FALSE,"UnityCapture_Wantl");
 if(existing){CloseHandle(existing);puts("FAIL test slot is occupied");return 2;}
 HANDLE want=CreateEventA(nullptr,FALSE,FALSE,"UnityCapture_Wantl");
 HMODULE dll=LoadLibraryW(argv[1]);if(!dll){puts("FAIL LoadLibrary");return 1;}
 auto factoryFn=reinterpret_cast<HRESULT(STDAPICALLTYPE*)(REFCLSID,REFIID,void**)>(GetProcAddress(dll,"DllGetClassObject"));
 GUID sourceId={0x5c2cd55c,0x92ad,0x4999,{0x86,0x66,0x91,0x2b,0xd3,0xe7,0x00,0x4d}}; // 0x10 + 1 + 60
 ComPtr<IClassFactory> factory;Check(factoryFn(sourceId,IID_PPV_ARGS(&factory)),"native factory");
 ComPtr<IBaseFilter> source;Check(factory->CreateInstance(nullptr,IID_PPV_ARGS(&source)),"native source");
 auto out=Pin(source.Get(),PINDIR_OUTPUT);ComPtr<IAMStreamConfig> config;Check(out.As(&config),"stream config");
 AM_MEDIA_TYPE* mt=nullptr;Check(config->GetFormat(&mt),"GetFormat");
 auto* vi=reinterpret_cast<VIDEOINFOHEADER*>(mt->pbFormat);vi->bmiHeader.biWidth=320;vi->bmiHeader.biHeight=240;vi->bmiHeader.biBitCount=static_cast<WORD>(bpp*8);vi->bmiHeader.biSizeImage=320*240*bpp;mt->subtype=bpp==4?MEDIASUBTYPE_ARGB32:MEDIASUBTYPE_RGB24;mt->lSampleSize=320*240*bpp;
 Check(config->SetFormat(mt),"SetFormat BGRA");
 GUID grabberId={0xC1F400A0,0x3F08,0x11d3,{0x9F,0x0B,0x00,0x60,0x08,0x03,0x9E,0x37}};
 ComPtr<IBaseFilter> grabFilter;Check(CoCreateInstance(grabberId,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&grabFilter)),"sample grabber");
 ComPtr<Grabber> grab;Check(grabFilter.As(&grab),"grabber interface");Check(grab->SetBufferSamples(TRUE),"sample buffering");
 AM_MEDIA_TYPE desired={};desired.majortype=MEDIATYPE_Video;desired.subtype=mt->subtype;desired.formattype=FORMAT_VideoInfo;Check(grab->SetMediaType(&desired),"grabber format");
 GUID nullId={0xC1F400A4,0x3F08,0x11d3,{0x9F,0x0B,0x00,0x60,0x08,0x03,0x9E,0x37}};
 ComPtr<IBaseFilter> sink;Check(CoCreateInstance(nullId,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&sink)),"null renderer");
 ComPtr<IGraphBuilder> graph;Check(CoCreateInstance(CLSID_FilterGraph,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&graph)),"graph");
 Check(graph->AddFilter(source.Get(),L"Isolated YuiTracking test"),"add source");Check(graph->AddFilter(grabFilter.Get(),L"Grabber"),"add grabber");Check(graph->AddFilter(sink.Get(),L"Sink"),"add sink");
 auto in=Pin(grabFilter.Get(),PINDIR_INPUT);Check(graph->ConnectDirect(out.Get(),in.Get(),mt),"connect source");
 auto grabOut=Pin(grabFilter.Get(),PINDIR_OUTPUT);auto sinkIn=Pin(sink.Get(),PINDIR_INPUT);Check(graph->ConnectDirect(grabOut.Get(),sinkIn.Get(),nullptr),"connect sink");
 ComPtr<IMediaControl> control;Check(graph.As(&control),"control");Check(control->Run(),"run");
 CoTaskMemFree(mt->pbFormat);CoTaskMemFree(mt); std::vector<unsigned char> pixels(320*240*bpp);
 auto read=[&](){long size=static_cast<long>(pixels.size());return grab->GetCurrentBuffer(&size,reinterpret_cast<long*>(pixels.data()))==S_OK&&size==pixels.size();};
 auto blank=[&](){return read()&&std::all_of(pixels.begin(),pixels.end(),[](unsigned char b){return b==0;});};
 Sleep(1200);if(!blank()){puts("FAIL cold start must be transparent black after startup frames");return 1;}puts("PASS cold start has no text/pattern and alpha is zero");
 SharedImageMemory sender(60);if(!sender.SendIsReady()){puts("FAIL sender not ready");return 1;}
 std::vector<unsigned char> input(320*240*4);for(size_t i=0;i<input.size();i+=4){input[i]=230;input[i+1]=40;input[i+2]=90;input[i+3]=255;}
 auto send=[&](){sender.Send(320,240,320,static_cast<DWORD>(input.size()),SharedImageMemory::FORMAT_UINT8,SharedImageMemory::RESIZEMODE_DISABLED,SharedImageMemory::MIRRORMODE_DISABLED,100,input.data());};
 auto color=[&](){if(!read())return false;for(size_t i=0;i<pixels.size();i+=bpp)if(pixels[i]!=90||pixels[i+1]!=40||pixels[i+2]!=230||(bpp==4&&pixels[i+3]!=255))return false;return true;};
 for(int i=0;i<15;i++){send();Sleep(35);}if(!color()){puts("FAIL live frame changed");return 1;}puts("PASS live BGRA frames remain intact");
 Sleep(1800);if(!blank()){puts("FAIL disconnected frame must be blank");return 1;}puts("PASS producer timeout has no text/pattern and alpha is zero");
 for(int i=0;i<15;i++){send();Sleep(35);}if(!color()){puts("FAIL reconnect failed");return 1;}puts("PASS same receiver resumes after producer restart");
 control->Stop();CloseHandle(want);return 0;
}


