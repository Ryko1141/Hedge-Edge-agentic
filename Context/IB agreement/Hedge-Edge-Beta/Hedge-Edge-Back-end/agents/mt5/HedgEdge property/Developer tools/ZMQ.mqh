//+------------------------------------------------------------------+
//|                                                          ZMQ.mqh |
//|                                   Copyright 2026, Hedge Edge     |
//|                                     https://www.hedge-edge.com   |
//+------------------------------------------------------------------+
//| ZeroMQ Wrapper for MQL5                                          |
//| Based on mql-zmq by nicholashagen / dingmaotu                    |
//| Provides high-performance messaging between EA and Hedge Edge app|
//+------------------------------------------------------------------+
#ifndef ZMQ_MQH
#define ZMQ_MQH

#property copyright "Copyright 2026, Hedge Edge"
#property link      "https://www.hedge-edge.com"
#property version   "1.00"
#property strict

//+------------------------------------------------------------------+
//| ZeroMQ Constants                                                  |
//+------------------------------------------------------------------+

// Socket types
#define ZMQ_PAIR    0
#define ZMQ_PUB     1
#define ZMQ_SUB     2
#define ZMQ_REQ     3
#define ZMQ_REP     4
#define ZMQ_DEALER  5
#define ZMQ_ROUTER  6
#define ZMQ_PULL    7
#define ZMQ_PUSH    8
#define ZMQ_XPUB    9
#define ZMQ_XSUB    10
#define ZMQ_STREAM  11

// Socket options
#define ZMQ_AFFINITY                4
#define ZMQ_ROUTING_ID              5
#define ZMQ_SUBSCRIBE               6
#define ZMQ_UNSUBSCRIBE             7
#define ZMQ_RATE                    8
#define ZMQ_RECOVERY_IVL            9
#define ZMQ_SNDBUF                  11
#define ZMQ_RCVBUF                  12
#define ZMQ_RCVMORE                 13
#define ZMQ_FD                      14
#define ZMQ_EVENTS                  15
#define ZMQ_TYPE                    16
#define ZMQ_LINGER                  17
#define ZMQ_RECONNECT_IVL           18
#define ZMQ_BACKLOG                 19
#define ZMQ_RECONNECT_IVL_MAX       21
#define ZMQ_MAXMSGSIZE              22
#define ZMQ_SNDHWM                  23
#define ZMQ_RCVHWM                  24
#define ZMQ_MULTICAST_HOPS          25
#define ZMQ_RCVTIMEO                27
#define ZMQ_SNDTIMEO                28
#define ZMQ_LAST_ENDPOINT           32
#define ZMQ_ROUTER_MANDATORY        33
#define ZMQ_TCP_KEEPALIVE           34
#define ZMQ_TCP_KEEPALIVE_CNT       35
#define ZMQ_TCP_KEEPALIVE_IDLE      36
#define ZMQ_TCP_KEEPALIVE_INTVL     37
#define ZMQ_IMMEDIATE               39
#define ZMQ_XPUB_VERBOSE            40
#define ZMQ_ROUTER_RAW              41
#define ZMQ_IPV6                    42
#define ZMQ_MECHANISM               43
#define ZMQ_PLAIN_SERVER            44
#define ZMQ_PLAIN_USERNAME          45
#define ZMQ_PLAIN_PASSWORD          46
#define ZMQ_CURVE_SERVER            47
#define ZMQ_CURVE_PUBLICKEY         48
#define ZMQ_CURVE_SECRETKEY         49
#define ZMQ_CURVE_SERVERKEY         50
#define ZMQ_PROBE_ROUTER            51
#define ZMQ_REQ_CORRELATE           52
#define ZMQ_REQ_RELAXED             53
#define ZMQ_CONFLATE                54
#define ZMQ_ZAP_DOMAIN              55
#define ZMQ_ROUTER_HANDOVER         56
#define ZMQ_TOS                     57
#define ZMQ_CONNECT_ROUTING_ID      61
#define ZMQ_GSSAPI_SERVER           62
#define ZMQ_GSSAPI_PRINCIPAL        63
#define ZMQ_GSSAPI_SERVICE_PRINCIPAL 64
#define ZMQ_GSSAPI_PLAINTEXT        65
#define ZMQ_HANDSHAKE_IVL           66
#define ZMQ_SOCKS_PROXY             68
#define ZMQ_XPUB_NODROP             69
#define ZMQ_BLOCKY                  70
#define ZMQ_XPUB_MANUAL             71
#define ZMQ_XPUB_WELCOME_MSG        72
#define ZMQ_STREAM_NOTIFY           73
#define ZMQ_INVERT_MATCHING         74
#define ZMQ_HEARTBEAT_IVL           75
#define ZMQ_HEARTBEAT_TTL           76
#define ZMQ_HEARTBEAT_TIMEOUT       77
#define ZMQ_XPUB_VERBOSER           78
#define ZMQ_CONNECT_TIMEOUT         79
#define ZMQ_TCP_MAXRT               80
#define ZMQ_THREAD_SAFE             81
#define ZMQ_MULTICAST_MAXTPDU       84
#define ZMQ_VMCI_BUFFER_SIZE        85
#define ZMQ_VMCI_BUFFER_MIN_SIZE    86
#define ZMQ_VMCI_BUFFER_MAX_SIZE    87
#define ZMQ_VMCI_CONNECT_TIMEOUT    88
#define ZMQ_USE_FD                  89

// Send/recv flags
#define ZMQ_DONTWAIT                1
#define ZMQ_SNDMORE                 2

// Poll events
#define ZMQ_POLLIN                  1
#define ZMQ_POLLOUT                 2
#define ZMQ_POLLERR                 4
#define ZMQ_POLLPRI                 8

// Error codes
#define ZMQ_EAGAIN                  11
#define ZMQ_ENOTSUP                 156384713
#define ZMQ_EPROTONOSUPPORT         156384714
#define ZMQ_ENOBUFS                 156384715
#define ZMQ_ENETDOWN                156384716
#define ZMQ_EADDRINUSE              156384717
#define ZMQ_EADDRNOTAVAIL           156384718
#define ZMQ_ECONNREFUSED            156384719
#define ZMQ_EINPROGRESS             156384720
#define ZMQ_ENOTSOCK                156384721
#define ZMQ_EMSGSIZE                156384722
#define ZMQ_EAFNOSUPPORT            156384723
#define ZMQ_ENETUNREACH             156384724
#define ZMQ_ECONNABORTED            156384725
#define ZMQ_ECONNRESET              156384726
#define ZMQ_ENOTCONN                156384727
#define ZMQ_ETIMEDOUT               156384728
#define ZMQ_EHOSTUNREACH            156384729
#define ZMQ_ENETRESET               156384730
#define ZMQ_EFSM                    156384763
#define ZMQ_ENOCOMPATPROTO          156384764
#define ZMQ_ETERM                   156384765
#define ZMQ_EMTHREAD                156384766

//+------------------------------------------------------------------+
//| ZeroMQ DLL Imports                                                |
//| Library: libzmq.dll (must be in MQL5/Libraries/)                 |
//+------------------------------------------------------------------+
#import "libzmq.dll"

// Version
void zmq_version(int &major, int &minor, int &patch);

// Context
long zmq_ctx_new();
int  zmq_ctx_term(long context);
int  zmq_ctx_shutdown(long context);
int  zmq_ctx_set(long context, int option, int optval);
int  zmq_ctx_get(long context, int option);

// Socket
long zmq_socket(long context, int type);
int  zmq_close(long socket);
int  zmq_setsockopt(long socket, int option, const uchar &optval[], int optvallen);
int  zmq_getsockopt(long socket, int option, uchar &optval[], int &optvallen);
int  zmq_bind(long socket, const uchar &endpoint[]);
int  zmq_connect(long socket, const uchar &endpoint[]);
int  zmq_unbind(long socket, const uchar &endpoint[]);
int  zmq_disconnect(long socket, const uchar &endpoint[]);

// Message
int  zmq_msg_init(long &msg[]);
int  zmq_msg_init_size(long &msg[], int size);
int  zmq_msg_init_data(long &msg[], uchar &data[], int size, long ffn, long hint);
int  zmq_msg_send(long &msg[], long socket, int flags);
int  zmq_msg_recv(long &msg[], long socket, int flags);
int  zmq_msg_close(long &msg[]);
long zmq_msg_data(long &msg[]);
int  zmq_msg_size(long &msg[]);
int  zmq_msg_more(long &msg[]);
int  zmq_msg_copy(long &dest[], long &src[]);
int  zmq_msg_move(long &dest[], long &src[]);
int  zmq_msg_get(long &msg[], int property);
int  zmq_msg_set(long &msg[], int property, int optval);
string zmq_msg_gets(long &msg[], const char &property[]);

// Simple send/recv (uses internal buffer)
int  zmq_send(long socket, const uchar &buf[], int len, int flags);
int  zmq_recv(long socket, uchar &buf[], int len, int flags);
int  zmq_send_const(long socket, const uchar &buf[], int len, int flags);

// Polling
int  zmq_poll(long &items[], int nitems, long timeout);

// Error handling
int  zmq_errno();
string zmq_strerror(int errnum);

#import

//+------------------------------------------------------------------+
//| ZMQ Helper Class - Encapsulates ZeroMQ operations                |
//+------------------------------------------------------------------+
class CZmqContext
{
private:
   long m_context;
   bool m_initialized;
   
public:
   CZmqContext() : m_context(0), m_initialized(false) {}
   
   ~CZmqContext()
   {
      if(m_initialized && m_context != 0)
      {
         Shutdown();
      }
   }
   
   bool Initialize()
   {
      if(m_initialized)
         return true;
         
      m_context = zmq_ctx_new();
      m_initialized = (m_context != 0);
      
      if(!m_initialized)
      {
         Print("ZMQ: Failed to create context, error: ", zmq_errno());
      }
      
      return m_initialized;
   }
   
   void Shutdown()
   {
      if(m_initialized && m_context != 0)
      {
         zmq_ctx_term(m_context);
         m_context = 0;
         m_initialized = false;
      }
   }
   
   long Handle() const { return m_context; }
   bool IsInitialized() const { return m_initialized; }
};

//+------------------------------------------------------------------+
//| ZMQ Socket Helper Class                                           |
//+------------------------------------------------------------------+
class CZmqSocket
{
private:
   long   m_socket;
   long   m_context;
   int    m_type;
   bool   m_bound;
   bool   m_connected;
   string m_endpoint;
   
public:
   CZmqSocket() : m_socket(0), m_context(0), m_type(-1), m_bound(false), m_connected(false) {}
   
   ~CZmqSocket()
   {
      Close();
   }
   
   bool Create(CZmqContext &context, int type)
   {
      if(!context.IsInitialized())
      {
         Print("ZMQ Socket: Context not initialized");
         return false;
      }
      
      m_context = context.Handle();
      m_type = type;
      m_socket = zmq_socket(m_context, type);
      
      if(m_socket == 0)
      {
         Print("ZMQ Socket: Failed to create socket, error: ", zmq_errno());
         return false;
      }
      
      return true;
   }
   
   bool Bind(string endpoint)
   {
      if(m_socket == 0)
      {
         Print("ZMQ Socket: Socket not created");
         return false;
      }
      
      uchar endpointArr[];
      StringToCharArray(endpoint, endpointArr);
      
      int result = zmq_bind(m_socket, endpointArr);
      
      if(result != 0)
      {
         int err = zmq_errno();
         // If port is already in use (zombie socket from crashed EA), try to recover
         if(err == 100 || err == ZMQ_EADDRINUSE) // 100 = EADDRINUSE on Windows
         {
            Print("ZMQ Socket: Port in use, attempting recovery via unbind+rebind on ", endpoint);
            // Try unbinding first (may release zombie socket in same process)
            zmq_unbind(m_socket, endpointArr);
            Sleep(200);
            
            // Retry bind
            result = zmq_bind(m_socket, endpointArr);
            if(result != 0)
            {
               // Last resort: close socket, recreate and try again
               Print("ZMQ Socket: Unbind+rebind failed, recreating socket...");
               SetLinger(0);
               zmq_close(m_socket);
               Sleep(500);
               m_socket = zmq_socket(m_context, m_type);
               if(m_socket != 0)
               {
                  result = zmq_bind(m_socket, endpointArr);
               }
            }
         }
         
         if(result != 0)
         {
            Print("ZMQ Socket: Failed to bind to ", endpoint, ", error: ", zmq_errno());
            Print("ZMQ Socket: If port is stuck, restart the MT5 terminal to release zombie sockets");
            return false;
         }
      }
      
      m_bound = true;
      m_endpoint = endpoint;
      Print("ZMQ Socket: Bound to ", endpoint);
      return true;
   }
   
   bool Connect(string endpoint)
   {
      if(m_socket == 0)
      {
         Print("ZMQ Socket: Socket not created");
         return false;
      }
      
      uchar endpointArr[];
      StringToCharArray(endpoint, endpointArr);
      
      int result = zmq_connect(m_socket, endpointArr);
      
      if(result != 0)
      {
         Print("ZMQ Socket: Failed to connect to ", endpoint, ", error: ", zmq_errno());
         return false;
      }
      
      m_connected = true;
      m_endpoint = endpoint;
      Print("ZMQ Socket: Connected to ", endpoint);
      return true;
   }
   
   bool SetOption(int option, int value)
   {
      if(m_socket == 0) return false;
      
      uchar optval[4];
      optval[0] = (uchar)(value & 0xFF);
      optval[1] = (uchar)((value >> 8) & 0xFF);
      optval[2] = (uchar)((value >> 16) & 0xFF);
      optval[3] = (uchar)((value >> 24) & 0xFF);
      
      return zmq_setsockopt(m_socket, option, optval, 4) == 0;
   }
   
   bool SetLinger(int milliseconds)
   {
      return SetOption(ZMQ_LINGER, milliseconds);
   }
   
   bool SetSendTimeout(int milliseconds)
   {
      return SetOption(ZMQ_SNDTIMEO, milliseconds);
   }
   
   bool SetReceiveTimeout(int milliseconds)
   {
      return SetOption(ZMQ_RCVTIMEO, milliseconds);
   }
   
   bool SetHighWaterMark(int messages)
   {
      return SetOption(ZMQ_SNDHWM, messages) && SetOption(ZMQ_RCVHWM, messages);
   }
   
   int Send(string message, int flags = 0)
   {
      if(m_socket == 0) return -1;
      
      uchar buf[];
      int len = StringToCharArray(message, buf, 0, WHOLE_ARRAY, CP_UTF8) - 1; // Exclude null terminator
      
      if(len <= 0) return -1;
      
      return zmq_send(m_socket, buf, len, flags);
   }
   
   int SendBytes(uchar &data[], int len, int flags = 0)
   {
      if(m_socket == 0) return -1;
      return zmq_send(m_socket, data, len, flags);
   }
   
   string Receive(int maxSize = 65536, int flags = 0)
   {
      if(m_socket == 0) return "";
      
      uchar buf[];
      ArrayResize(buf, maxSize);
      ArrayInitialize(buf, 0);
      
      int received = zmq_recv(m_socket, buf, maxSize, flags);
      
      if(received <= 0)
         return "";
      
      return CharArrayToString(buf, 0, received, CP_UTF8);
   }
   
   int ReceiveBytes(uchar &data[], int maxSize, int flags = 0)
   {
      if(m_socket == 0) return -1;
      
      ArrayResize(data, maxSize);
      return zmq_recv(m_socket, data, maxSize, flags);
   }
   
   void Close()
   {
      if(m_socket != 0)
      {
         // Set linger to 0 for immediate close
         SetLinger(0);
         
         if(m_bound)
         {
            uchar endpointArr[];
            StringToCharArray(m_endpoint, endpointArr);
            zmq_unbind(m_socket, endpointArr);
            m_bound = false;
         }
         
         if(m_connected)
         {
            uchar endpointArr[];
            StringToCharArray(m_endpoint, endpointArr);
            zmq_disconnect(m_socket, endpointArr);
            m_connected = false;
         }
         
         zmq_close(m_socket);
         m_socket = 0;
         Print("ZMQ Socket: Closed");
      }
   }
   
   long Handle() const { return m_socket; }
   bool IsBound() const { return m_bound; }
   bool IsConnected() const { return m_connected; }
   string Endpoint() const { return m_endpoint; }
   int Type() const { return m_type; }
};

//+------------------------------------------------------------------+
//| ZMQ Publisher Helper - For streaming data                         |
//+------------------------------------------------------------------+
class CZmqPublisher
{
private:
   CZmqSocket m_socket;
   
public:
   bool Initialize(CZmqContext &context, string endpoint)
   {
      if(!m_socket.Create(context, ZMQ_PUB))
         return false;
      
      // Configure for low latency
      m_socket.SetLinger(100);
      m_socket.SetHighWaterMark(1000);
      m_socket.SetSendTimeout(100);
      
      return m_socket.Bind(endpoint);
   }
   
   int Publish(string topic, string message)
   {
      // Format: "topic message"
      string fullMessage = topic + " " + message;
      return m_socket.Send(fullMessage);
   }
   
   int PublishJson(string message)
   {
      // Publish without topic prefix for simple JSON streaming
      return m_socket.Send(message);
   }
   
   void Shutdown()
   {
      m_socket.Close();
   }
};

//+------------------------------------------------------------------+
//| ZMQ Replier Helper - For request/response commands                |
//+------------------------------------------------------------------+
class CZmqReplier
{
private:
   CZmqSocket m_socket;
   
public:
   bool Initialize(CZmqContext &context, string endpoint)
   {
      if(!m_socket.Create(context, ZMQ_REP))
         return false;
      
      // Configure for command handling
      m_socket.SetLinger(100);
      m_socket.SetReceiveTimeout(10); // Non-blocking check
      m_socket.SetSendTimeout(1000);
      
      return m_socket.Bind(endpoint);
   }
   
   bool Poll(string &request)
   {
      // Non-blocking receive (uses timeout set above)
      request = m_socket.Receive(65536, ZMQ_DONTWAIT);
      return StringLen(request) > 0;
   }
   
   bool Reply(string response)
   {
      int sent = m_socket.Send(response);
      return sent >= 0;
   }
   
   void Shutdown()
   {
      m_socket.Close();
   }
};

//+------------------------------------------------------------------+
//| Get ZeroMQ Version String                                         |
//+------------------------------------------------------------------+
string ZmqVersion()
{
   int major, minor, patch;
   zmq_version(major, minor, patch);
   return StringFormat("%d.%d.%d", major, minor, patch);
}

//+------------------------------------------------------------------+
//| Get Last ZMQ Error as String                                      |
//+------------------------------------------------------------------+
string ZmqLastError()
{
   int errnum = zmq_errno();
   return zmq_strerror(errnum);
}

#endif // ZMQ_MQH
