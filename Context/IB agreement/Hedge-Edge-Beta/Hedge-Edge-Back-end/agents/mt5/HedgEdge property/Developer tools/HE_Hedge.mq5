//+------------------------------------------------------------------+
//|                                                 HE_slave.mq5     |
//|                         Copyright 2025, HedgEdge Technologies    |
//|                                     https://www.hedge-edge.com   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, HedgEdge Technologies"
#property link      "https://www.hedge-edge.com"
#property version   "3.10"
#property description "HE_slave - HedgEdge Slave/Follower EA"
#property description "Receives & executes trades from HE_prop master."
#property description "Subscribes via ZMQ PUB/SUB (libzmq.dll + libsodium.dll)."
#property strict

//--- Include ZMQ v2 wrapper (CURVE + monitor + topic PUB/SUB)
//--- This imports libzmq.dll and libsodium.dll from MQL5/Libraries/
#include <ZMQv2.mqh>

//--- Windows API for DLL detection
#import "kernel32.dll"
   int GetModuleHandleW(string lpModuleName);
#import

//--- DLL imports for license validation (optional, graceful fallback)
#import "HedgeEdgeLicense.dll"
   int  ValidateLicense(string key, string account, string broker, string deviceId,
                        string endpointUrl, char &outToken[], char &outError[]);
   int  GetCachedToken(char &outToken[], int tokenLen);
   int  IsTokenValid();
   int  GetTokenTTL();
   void SetEndpoint(string url);
   void ClearCache();
   int  InitializeLibrary();
   void ShutdownLibrary();
#import

//+------------------------------------------------------------------+
//| Input Parameters                                                  |
//+------------------------------------------------------------------+
input group "=== License Settings ==="
input string InpLicenseKey = "";                     // License Key
input string InpDeviceId = "";                       // Device ID (auto if blank)
input string InpEndpointUrl = "https://hedgeedge-railway-backend-production.up.railway.app/v1/license/validate"; // API Endpoint
input int    InpPollIntervalSeconds = 300;           // License Check Interval (s)
input bool   InpDevMode = false;                     // DEV MODE (skip license)

input group "=== Master Connection ==="
input string InpMasterAddress = "localhost";         // Master Address (IP/hostname)
input int    InpMasterDataPort = 51810;              // Master PUB Port (data)
input int    InpMasterCommandPort = 51811;           // Master REP Port (commands)
input bool   InpEnableCurve = false;                 // Enable CURVE Encryption
input string InpMasterPublicKey = "";                // Master Public Key (Z85, from registration)

input group "=== Trade Copy Settings ==="
input double InpLotMultiplier = 1.0;                 // Lot Multiplier (1.0 = same size)
input double InpFixedLots = 0.0;                     // Fixed Lot Size (0 = use multiplier)
input double InpMaxLots = 100.0;                     // Maximum Lots per Trade
input int    InpSlippage = 10;                       // Max Slippage (points)
input int    InpMagicNumber = 123456;                // Magic Number for copied trades
input string InpTradeComment = "HE-Copy";            // Trade Comment Prefix
input bool   InpCopySLTP = true;                     // Copy Stop Loss / Take Profit
input bool   InpInvertTrades = true;                 // Invert Trade Direction (ALWAYS true for hedge copier)
input bool   InpCopyCloseSignals = true;             // Copy Close Signals

input group "=== App Communication ==="
input int    InpCommandPort = 51821;                 // Local REP Port (app commands)
input bool   InpEnableLocalCommands = true;          // Enable App Command Channel

input group "=== Display Settings ==="
input color  InpActiveColor = clrDodgerBlue;
input color  InpPausedColor = clrOrange;
input color  InpErrorColor = clrRed;
input color  InpTradeColor = clrLime;

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
bool g_isLicenseValid = false;
bool g_isPaused = false;
bool g_dllLoaded = false;
bool g_zmqInitialized = false;
bool g_subscriberConnected = false;
string g_lastError = "";
string g_statusMessage = "Initializing...";
datetime g_lastLicenseCheck = 0;
string g_deviceId = "";

// Runtime-overridable copy settings (initialised from input, can be pushed by Electron)
bool   g_invertTrades = true;        // initialised in OnInit() from InpInvertTrades
double g_lotMultiplier = 1.0;        // initialised from InpLotMultiplier
double g_fixedLots = 0.0;            // initialised from InpFixedLots
bool   g_copySLTP = true;            // initialised from InpCopySLTP

// Stats
ulong g_eventsReceived = 0;
ulong g_tradesCopied = 0;
ulong g_tradesFailed = 0;
datetime g_lastEventTime = 0;
datetime g_lastHeartbeatTime = 0;

// ZMQ
CZmqContext g_zmqContext;
CZmqSubscriber g_subscriber;
CZmqRequester g_requester;
CZmqReplier g_localReplier;  // for Electron app communication

// CURVE
uchar g_clientPublicKey[41];
uchar g_clientSecretKey[41];
uchar g_masterPublicKey[41];
bool  g_curveEnabled = false;

// Position mapping (master ticket -> slave ticket)
struct PositionMap
{
   ulong masterTicket;
   ulong slaveTicket;
   string symbol;
   double volume;
   int    type;  // POSITION_TYPE_BUY/SELL
};
PositionMap g_positionMap[];

// Registration file
string g_registrationFilePath = "";

// Shared license key (read from FILE_COMMON if input is blank)
string g_sharedLicenseKey = "";

// Trade log watermark (last deal ticket logged to prevent duplicates)
ulong g_lastLoggedDealTicket = 0;

//+------------------------------------------------------------------+
//| Read shared license key from Common Files                          |
//| The Electron app writes the key to HedgeEdge\license.key so all   |
//| EAs can auto-read it without manual input per terminal.            |
//+------------------------------------------------------------------+
string ReadSharedLicenseKey()
{
   string filename = "HedgeEdge\\license.key";
   if(!FileIsExist(filename, FILE_COMMON))
   {
      Print("No shared license file found: ", filename);
      return "";
   }
   
   int handle = FileOpen(filename, FILE_READ|FILE_TXT|FILE_COMMON, 0, CP_UTF8);
   if(handle == INVALID_HANDLE)
   {
      Print("WARNING: Cannot open shared license file: ", filename);
      return "";
   }
   
   string key = "";
   if(!FileIsEnding(handle))
      key = FileReadString(handle);
   FileClose(handle);
   
   // Trim whitespace/newlines
   StringTrimLeft(key);
   StringTrimRight(key);
   
   if(StringLen(key) < 8)
   {
      Print("Shared license key too short or empty, ignoring");
      return "";
   }
   
   Print("Shared license key loaded from Common Files (", StringLen(key), " chars)");
   return key;
}

//+------------------------------------------------------------------+
//| Write a trade log entry to FILE_COMMON for offline sync            |
//| The Electron app reads these on startup to reconcile missed trades |
//| Format: JSON Lines (.jsonl) — one JSON object per line             |
//+------------------------------------------------------------------+
void WriteTradeLogEntry(string eventType, string symbol, string side, double volume,
                        double profit, double swap, double commission,
                        ulong masterTicket, ulong slaveTicket, double entryPrice, double closePrice)
{
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string filename = "HedgeEdge\\trade_log_" + login + ".jsonl";
   
   int handle = FileOpen(filename, FILE_READ|FILE_WRITE|FILE_TXT|FILE_COMMON, 0, CP_UTF8);
   if(handle == INVALID_HANDLE)
   {
      Print("WARNING: Failed to open trade log file: ", filename);
      return;
   }
   
   // Seek to end of file (append mode)
   FileSeek(handle, 0, SEEK_END);
   
   string json = "{";
   json += "\"event\":\"" + eventType + "\",";
   json += "\"account\":\"" + login + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"masterTicket\":" + IntegerToString(masterTicket) + ",";
   json += "\"slaveTicket\":" + IntegerToString(slaveTicket) + ",";
   json += "\"symbol\":\"" + symbol + "\",";
   json += "\"side\":\"" + side + "\",";
   json += "\"volume\":" + DoubleToString(volume, 2) + ",";
   json += "\"entryPrice\":" + DoubleToString(entryPrice, 5) + ",";
   json += "\"closePrice\":" + DoubleToString(closePrice, 5) + ",";
   json += "\"profit\":" + DoubleToString(profit, 2) + ",";
   json += "\"swap\":" + DoubleToString(swap, 2) + ",";
   json += "\"commission\":" + DoubleToString(commission, 2) + ",";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"timestampUnix\":" + IntegerToString((long)TimeCurrent());
   json += "}";
   
   FileWriteString(handle, json + "\n");
   FileClose(handle);
   
   Print("Trade log entry written: ", eventType, " ", symbol, " ", side, " ", DoubleToString(volume, 2),
         " P&L=", DoubleToString(profit, 2));
}

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("═══════════════════════════════════════════════════════════");
   Print("  HedgEdge SLAVE EA v3.0 - Starting...");
   Print("═══════════════════════════════════════════════════════════");
   
   //--- CURVE setup
   if(InpEnableCurve)
   {
      if(StringLen(InpMasterPublicKey) > 0)
      {
         // Generate our own keypair (client side)
         if(CZmqCurve::GenerateKeypair(g_clientPublicKey, g_clientSecretKey))
         {
            // Parse master's public key from input
            if(CZmqCurve::StringToKey(InpMasterPublicKey, g_masterPublicKey))
            {
               g_curveEnabled = true;
               Print("CURVE encryption enabled (client mode)");
            }
            else
            {
               Print("WARNING: Invalid master public key format. Running without encryption.");
            }
         }
         else
         {
            Print("WARNING: CURVE keypair generation failed. Running without encryption.");
         }
      }
      else
      {
         Print("WARNING: CURVE enabled but no master public key provided. Running without encryption.");
      }
   }
   
   //--- Initialize ZMQ
   if(!InitializeZMQ())
   {
      g_statusMessage = "ERROR: ZMQ failed - ensure libzmq.dll is in MQL5/Libraries/";
      UpdateComment();
      Alert("HedgEdge Slave: libzmq.dll not found in MQL5/Libraries/");
      return INIT_FAILED;
   }
   
   //--- Device ID
   g_deviceId = (StringLen(InpDeviceId) > 0) ? InpDeviceId : GenerateDeviceId();
   
   //--- Resolve license key: prefer manual input, fallback to shared file
   string effectiveLicenseKey = InpLicenseKey;
   if(StringLen(effectiveLicenseKey) == 0 && !InpDevMode)
   {
      effectiveLicenseKey = ReadSharedLicenseKey();
      if(StringLen(effectiveLicenseKey) > 0)
      {
         g_sharedLicenseKey = effectiveLicenseKey;
         Print("Using shared license key from Common Files");
      }
   }
   
   //--- Initialize License DLL (optional, graceful fallback)
   bool dllAvailable = InitializeDLL();
   if(!dllAvailable)
   {
      Print("WARNING: HedgeEdgeLicense.dll not available");
      if(!InpDevMode)
      {
         if(StringLen(effectiveLicenseKey) == 0)
         {
            g_statusMessage = "ERROR: License Key is required (set in EA or place in Common Files)";
            UpdateComment();
            Alert("HedgEdge: No license key provided. EA cannot start.");
            return INIT_PARAMETERS_INCORRECT;
         }
         if(!ValidateLicenseViaWebRequest(effectiveLicenseKey))
         {
            g_statusMessage = "LICENSE INVALID: " + g_lastError;
            UpdateComment();
            Alert("HedgEdge: License validation failed — ", g_lastError);
            Print("LICENSE: EA blocked — validation failed. Returning INIT_FAILED.");
            return INIT_FAILED;
         }
         g_isLicenseValid = true;
      }
      else
      {
         Print("*** DEV MODE: Running without license DLL ***");
         g_isLicenseValid = true;
      }
   }
   else
   {
      if(StringLen(effectiveLicenseKey) == 0 && !InpDevMode)
      {
         g_statusMessage = "ERROR: License Key is required (set in EA or place in Common Files)";
         UpdateComment();
         Alert("HedgEdge: No license key provided. EA cannot start.");
         return INIT_PARAMETERS_INCORRECT;
      }
      if(StringLen(effectiveLicenseKey) > 0)
      {
         SetEndpoint(InpEndpointUrl);
         if(!ValidateLicenseWithDLL(effectiveLicenseKey))
         {
            g_statusMessage = "LICENSE INVALID: " + g_lastError;
            UpdateComment();
            Alert("HedgEdge: License validation failed — ", g_lastError);
            Print("LICENSE: EA blocked — DLL validation failed. Returning INIT_FAILED.");
            return INIT_FAILED;
         }
         g_isLicenseValid = true;
      }
      else
      {
         Print("*** DEV MODE: DLL loaded, license skipped ***");
         g_isLicenseValid = true;
      }
   }
   
   if(g_dllLoaded) SetEndpoint(InpEndpointUrl);
   
   g_statusMessage = g_isLicenseValid ? 
      (InpDevMode ? "DEV MODE - Slave Active" : "Licensed - Slave Active") :
      "Awaiting License";
   
   //--- Write registration file
   WriteRegistrationFile();
   
   UpdateComment();
   Print("  Slave EA initialized");
   Print("  Master: ", InpMasterAddress, ":", InpMasterDataPort);
   Print("  CURVE: ", g_curveEnabled ? "ENABLED" : "disabled");
   Print("  Lot Multiplier: ", DoubleToString(InpLotMultiplier, 2));
   if(InpFixedLots > 0) Print("  Fixed Lots: ", DoubleToString(InpFixedLots, 2));
   // Initialise runtime globals from input parameters
   g_invertTrades  = InpInvertTrades;
   g_lotMultiplier = InpLotMultiplier;
   g_fixedLots     = InpFixedLots;
   g_copySLTP      = InpCopySLTP;
   if(g_invertTrades) Print("  *** INVERTED MODE (HEDGE) ***");
   Print("═══════════════════════════════════════════════════════════");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("═══════════════════════════════════════════════════════════");
   Print("  HedgEdge SLAVE EA - Shutting down...");
   Print("  Stats: ", g_eventsReceived, " events received, ",
         g_tradesCopied, " copied, ", g_tradesFailed, " failed");
   
   ShutdownZMQ();
   DeleteRegistrationFile();
   
   if(g_dllLoaded)
   {
      ClearCache();
      ShutdownLibrary();
      g_dllLoaded = false;
   }
   
   Comment("");
   DashDeleteAll();
   Print("  Slave EA stopped. Reason: ", reason);
   Print("═══════════════════════════════════════════════════════════");
}

//+------------------------------------------------------------------+
//| Timer - main processing loop                                       |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!g_zmqInitialized) return;
   
   //--- Receive and process Master events
   if(!g_isPaused && g_isLicenseValid)
      ProcessMasterEvents();
   
   //--- Process app commands  
   if(InpEnableLocalCommands)
      ProcessLocalCommands();
   
   //--- Connection health check
   CheckConnectionHealth();
   
   //--- License check
   if(!InpDevMode && TimeCurrent() - g_lastLicenseCheck >= InpPollIntervalSeconds)
   {
      bool recheckOk;
      if(g_dllLoaded) recheckOk = ValidateLicenseWithDLL();
      else            recheckOk = ValidateLicenseViaWebRequest();
      
      if(!recheckOk)
      {
         g_isLicenseValid = false;
         g_statusMessage  = "LICENSE REVOKED: " + g_lastError;
         UpdateComment();
         Alert("HedgEdge: License is no longer valid - ", g_lastError);
         Print("LICENSE: Periodic recheck FAILED. EA will be removed.");
         ExpertRemove();
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| Tick handler                                                       |
//+------------------------------------------------------------------+
void OnTick()
{
   // Also process on tick for lower latency when market is active
   if(!g_zmqInitialized || g_isPaused || !g_isLicenseValid) return;
   ProcessMasterEvents();
}

//+------------------------------------------------------------------+
//| Process incoming events from Master                                |
//+------------------------------------------------------------------+
void ProcessMasterEvents()
{
   string topic = "", message = "";
   int maxPerTick = 50;  // Process up to 50 messages per tick to avoid lag
   
   for(int i = 0; i < maxPerTick; i++)
   {
      if(!g_subscriber.ReceiveWithTopic(topic, message))
         break;
      
      g_eventsReceived++;
      g_lastEventTime = TimeCurrent();
      
      if(topic == "EVENT")
         HandleEvent(message);
      else if(topic == "SNAPSHOT")
         HandleSnapshot(message);
      else
         Print("Unknown topic: ", topic);
   }
}

//+------------------------------------------------------------------+
//| Handle a discrete event from Master                                |
//+------------------------------------------------------------------+
void HandleEvent(string json)
{
   string eventType = ExtractJsonValue(json, "type");
   
   if(eventType == "POSITION_OPENED")
      HandlePositionOpened(json);
   else if(eventType == "POSITION_CLOSED")
      HandlePositionClosed(json);
   else if(eventType == "POSITION_MODIFIED")
      HandlePositionModified(json);
   else if(eventType == "POSITION_REVERSED")
      HandlePositionReversed(json);
   else if(eventType == "HEARTBEAT")
      HandleHeartbeat(json);
   else if(eventType == "CONNECTED")
      HandleMasterConnected(json);
   else if(eventType == "DISCONNECTED")
      HandleMasterDisconnected(json);
   else if(eventType == "ACCOUNT_UPDATE")
      HandleAccountUpdate(json);
   else
      Print("Unhandled event type: ", eventType);
}

//+------------------------------------------------------------------+
//| Handle POSITION_OPENED from Master                                 |
//+------------------------------------------------------------------+
void HandlePositionOpened(string json)
{
   // Extract from data object (nested JSON)
   string dataStr = ExtractNestedJson(json, "data");
   
   string symbol   = ExtractJsonValue(dataStr, "symbol");
   string side     = ExtractJsonValue(dataStr, "type");
   double volume   = StringToDouble(ExtractJsonValue(dataStr, "volume"));
   double sl       = StringToDouble(ExtractJsonValue(dataStr, "stopLoss"));
   double tp       = StringToDouble(ExtractJsonValue(dataStr, "takeProfit"));
   ulong  masterTicket = (ulong)StringToInteger(ExtractJsonValue(dataStr, "position"));
   
   // Check if we already have this position mapped (duplicate event protection)
   for(int i = 0; i < ArraySize(g_positionMap); i++)
   {
      if(g_positionMap[i].masterTicket == masterTicket)
      {
         Print("Duplicate POSITION_OPENED for master ticket #", masterTicket, " - ignoring");
         return;
      }
   }
   
   // ALWAYS invert for hedge copier — this is the core purpose of the app.
   // When g_invertTrades is true (default), BUY becomes SELL and vice versa,
   // and SL/TP are swapped (leader's SL → follower's TP, leader's TP → follower's SL).
   if(g_invertTrades)
   {
      side = (side == "BUY") ? "SELL" : "BUY";
      // Swap SL ↔ TP: leader's loss exit = follower's profit exit and vice versa
      double tmpSL = sl;
      sl = tp;   // Leader's TP becomes follower's SL
      tp = tmpSL; // Leader's SL becomes follower's TP
   }
   
   // Calculate lot size
   double lots = CalculateLotSize(symbol, volume);
   
   Print(">> COPY OPEN: ", symbol, " ", side, " ", DoubleToString(lots, 2),
         " (master #", masterTicket, ") [Inverted=", g_invertTrades ? "Y" : "N", "]");
   
   // Execute trade
   ulong slaveTicket = ExecuteOpen(symbol, side, lots, sl, tp, masterTicket);
   
   if(slaveTicket > 0)
   {
      // Store mapping
      int idx = ArraySize(g_positionMap);
      ArrayResize(g_positionMap, idx + 1);
      g_positionMap[idx].masterTicket = masterTicket;
      g_positionMap[idx].slaveTicket  = slaveTicket;
      g_positionMap[idx].symbol       = symbol;
      g_positionMap[idx].volume       = lots;
      g_positionMap[idx].type         = (side == "BUY") ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
      
      g_tradesCopied++;
      Print("<< COPY SUCCESS: slave #", slaveTicket, " for master #", masterTicket);
      
      // Log to trade history buffer (for offline sync with Electron app)
      WriteTradeLogEntry("COPY_OPEN", symbol, side, lots, 0, 0, 0,
                         masterTicket, slaveTicket,
                         SymbolInfoDouble(symbol, side == "BUY" ? SYMBOL_ASK : SYMBOL_BID), 0);
   }
   else
   {
      g_tradesFailed++;
      Print("<< COPY FAILED: master #", masterTicket);
   }
   
   UpdateComment();
}

//+------------------------------------------------------------------+
//| Handle POSITION_CLOSED from Master                                 |
//+------------------------------------------------------------------+
void HandlePositionClosed(string json)
{
   if(!InpCopyCloseSignals) return;
   
   string dataStr = ExtractNestedJson(json, "data");
   ulong masterTicket = (ulong)StringToInteger(ExtractJsonValue(dataStr, "position"));
   
   // Find mapped slave position
   for(int i = 0; i < ArraySize(g_positionMap); i++)
   {
      if(g_positionMap[i].masterTicket == masterTicket)
      {
         ulong slaveTicket = g_positionMap[i].slaveTicket;
         Print(">> COPY CLOSE: slave #", slaveTicket, " (master #", masterTicket, ")");
         
         if(ClosePositionByTicket(slaveTicket))
         {
            Print("<< CLOSE SUCCESS: slave #", slaveTicket);
            g_tradesCopied++;
            
            // Log to trade history buffer (for offline sync with Electron app)
            // Get closed profit from deal history
            double closedProfit = 0, closedSwap = 0, closedComm = 0;
            double closedPrice = 0;
            if(HistorySelect(TimeCurrent() - 60, TimeCurrent()))
            {
               for(int d = HistoryDealsTotal() - 1; d >= 0; d--)
               {
                  ulong dealTicket = HistoryDealGetTicket(d);
                  if(dealTicket > 0 && (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID) == slaveTicket)
                  {
                     closedProfit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
                     closedSwap   = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
                     closedComm   = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
                     closedPrice  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
                     break;
                  }
               }
            }
            
            WriteTradeLogEntry("COPY_CLOSE", g_positionMap[i].symbol,
                              g_positionMap[i].type == POSITION_TYPE_BUY ? "BUY" : "SELL",
                              g_positionMap[i].volume,
                              closedProfit, closedSwap, closedComm,
                              masterTicket, slaveTicket, 0, closedPrice);
         }
         else
         {
            Print("<< CLOSE FAILED: slave #", slaveTicket, " error=", GetLastError());
            g_tradesFailed++;
         }
         
         // Remove from mapping
         RemovePositionMap(i);
         UpdateComment();
         return;
      }
   }
   
   Print("No mapped position found for master ticket #", masterTicket);
}

//+------------------------------------------------------------------+
//| Handle POSITION_MODIFIED from Master                               |
//+------------------------------------------------------------------+
void HandlePositionModified(string json)
{
   if(!InpCopySLTP) return;
   
   string dataStr = ExtractNestedJson(json, "data");
   ulong masterTicket = (ulong)StringToInteger(ExtractJsonValue(dataStr, "position"));
   
   double newSL = StringToDouble(ExtractJsonValue(dataStr, "stopLoss"));
   double newTP = StringToDouble(ExtractJsonValue(dataStr, "takeProfit"));
   
   for(int i = 0; i < ArraySize(g_positionMap); i++)
   {
      if(g_positionMap[i].masterTicket == masterTicket)
      {
         ulong slaveTicket = g_positionMap[i].slaveTicket;
         Print(">> COPY MODIFY: slave #", slaveTicket, " SL=",
               DoubleToString(newSL, 5), " TP=", DoubleToString(newTP, 5));
         
         if(ModifyPositionSLTP(slaveTicket, newSL, newTP))
            Print("<< MODIFY SUCCESS: slave #", slaveTicket);
         else
            Print("<< MODIFY FAILED: slave #", slaveTicket, " error=", GetLastError());
         
         return;
      }
   }
   
   Print("No mapped position for master ticket #", masterTicket, " (modify)");
}

//+------------------------------------------------------------------+
//| Handle POSITION_REVERSED (close + open opposite)                   |
//+------------------------------------------------------------------+
void HandlePositionReversed(string json)
{
   HandlePositionClosed(json);
}

//+------------------------------------------------------------------+
//| Handle HEARTBEAT from Master                                       |
//+------------------------------------------------------------------+
void HandleHeartbeat(string json)
{
   g_lastHeartbeatTime = TimeCurrent();
   
   if(!g_subscriberConnected)
   {
      g_subscriberConnected = true;
      g_statusMessage = InpDevMode ? "DEV MODE - Slave Active" : "Licensed - Slave Active";
      UpdateComment();
   }
}

//+------------------------------------------------------------------+
//| Handle CONNECTED from Master                                       |
//+------------------------------------------------------------------+
void HandleMasterConnected(string json)
{
   g_subscriberConnected = true;
   Print("Master connected/reconnected. Synchronizing positions...");
   
   string dataStr = ExtractNestedJson(json, "data");
   ReconcilePositions(dataStr);
   
   g_statusMessage = InpDevMode ? "DEV MODE - Slave Active" : "Licensed - Slave Active";
   UpdateComment();
}

//+------------------------------------------------------------------+
//| Handle DISCONNECTED from Master                                    |
//+------------------------------------------------------------------+
void HandleMasterDisconnected(string json)
{
   g_subscriberConnected = false;
   g_statusMessage = "Master disconnected";
   UpdateComment();
   Print("Master sent DISCONNECTED signal");
}

//+------------------------------------------------------------------+
//| Handle ACCOUNT_UPDATE (periodic reconciliation)                    |
//+------------------------------------------------------------------+
void HandleAccountUpdate(string json)
{
   string dataStr = ExtractNestedJson(json, "data");
   ReconcilePositions(dataStr);
}

//+------------------------------------------------------------------+
//| Handle SNAPSHOT (legacy reconciliation)                             |
//+------------------------------------------------------------------+
void HandleSnapshot(string json)
{
   g_lastEventTime = TimeCurrent();
   g_lastHeartbeatTime = TimeCurrent();
   
   if(!g_subscriberConnected)
   {
      g_subscriberConnected = true;
      g_statusMessage = InpDevMode ? "DEV MODE - Slave Active" : "Licensed - Slave Active";
      UpdateComment();
   }
   
   ReconcilePositions(json);
}

//+------------------------------------------------------------------+
//| Reconcile slave positions with master state                        |
//+------------------------------------------------------------------+
void ReconcilePositions(string json)
{
   int posStart = StringFind(json, "\"positions\":[");
   if(posStart < 0) return;
   
   posStart = StringFind(json, "[", posStart);
   if(posStart < 0) return;
   
   int bracketDepth = 0;
   int posEnd = posStart;
   for(int i = posStart; i < StringLen(json); i++)
   {
      ushort ch = StringGetCharacter(json, i);
      if(ch == '[') bracketDepth++;
      else if(ch == ']') { bracketDepth--; if(bracketDepth == 0) { posEnd = i; break; } }
   }
   
   string positionsArrayStr = StringSubstr(json, posStart, posEnd - posStart + 1);
   
   // Look for positions we don't have mapped yet (missed POSITION_OPENED events)
   int objStart = 0;
   while(true)
   {
      objStart = StringFind(positionsArrayStr, "{", objStart);
      if(objStart < 0) break;
      
      int objEnd = StringFind(positionsArrayStr, "}", objStart);
      if(objEnd < 0) break;
      
      string posJson = StringSubstr(positionsArrayStr, objStart, objEnd - objStart + 1);
      objStart = objEnd + 1;
      
      string posId = ExtractJsonValue(posJson, "id");
      ulong masterTicket = (ulong)StringToInteger(posId);
      if(masterTicket == 0) continue;
      
      bool found = false;
      for(int i = 0; i < ArraySize(g_positionMap); i++)
      {
         if(g_positionMap[i].masterTicket == masterTicket) { found = true; break; }
      }
      
      if(!found)
      {
         string symbol  = ExtractJsonValue(posJson, "symbol");
         string side    = ExtractJsonValue(posJson, "side");
         double volumeLots = StringToDouble(ExtractJsonValue(posJson, "volumeLots"));
         if(volumeLots <= 0) volumeLots = StringToDouble(ExtractJsonValue(posJson, "volume")) / 100000.0;
         
         double sl = StringToDouble(ExtractJsonValue(posJson, "stopLoss"));
         double tp = StringToDouble(ExtractJsonValue(posJson, "takeProfit"));
         
         // Invert direction + swap SL/TP for hedge mode
         if(g_invertTrades)
         {
            side = (side == "BUY") ? "SELL" : "BUY";
            double tmpSL = sl;
            sl = tp;
            tp = tmpSL;
         }
         
         double lots = CalculateLotSize(symbol, volumeLots);
         
         Print("[RECONCILE] Opening missed position: ", symbol, " ", side, " ",
               DoubleToString(lots, 2), " master #", masterTicket, " [Inverted=", g_invertTrades ? "Y" : "N", "]");
         
         ulong slaveTicket = ExecuteOpen(symbol, side, lots, sl, tp, masterTicket);
         
         if(slaveTicket > 0)
         {
            int idx = ArraySize(g_positionMap);
            ArrayResize(g_positionMap, idx + 1);
            g_positionMap[idx].masterTicket = masterTicket;
            g_positionMap[idx].slaveTicket  = slaveTicket;
            g_positionMap[idx].symbol       = symbol;
            g_positionMap[idx].volume       = lots;
            g_positionMap[idx].type         = (side == "BUY") ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
            
            g_tradesCopied++;
            Print("[RECONCILE] Opened slave #", slaveTicket, " for master #", masterTicket);
         }
         else
         {
            g_tradesFailed++;
         }
      }
   }
   
   // Check for positions that Master has closed but we still have open
   for(int i = ArraySize(g_positionMap) - 1; i >= 0; i--)
   {
      bool masterHasIt = false;
      objStart = 0;
      while(true)
      {
         int searchPos = StringFind(positionsArrayStr, "\"" + IntegerToString(g_positionMap[i].masterTicket) + "\"", objStart);
         if(searchPos >= 0) { masterHasIt = true; break; }
         break;
      }
      
      if(!masterHasIt && InpCopyCloseSignals)
      {
         Print("[RECONCILE] Closing orphaned slave #", g_positionMap[i].slaveTicket,
               " (master #", g_positionMap[i].masterTicket, " no longer exists)");
         ClosePositionByTicket(g_positionMap[i].slaveTicket);
         RemovePositionMap(i);
      }
   }
}

//+------------------------------------------------------------------+
//| Check connection health                                            |
//+------------------------------------------------------------------+
void CheckConnectionHealth()
{
   if(!g_zmqInitialized) return;
   
   if(g_subscriberConnected && g_lastHeartbeatTime > 0 &&
      TimeCurrent() - g_lastHeartbeatTime > 15)
   {
      g_subscriberConnected = false;
      g_statusMessage = "Master connection lost (no heartbeat)";
      UpdateComment();
      Print("WARNING: No heartbeat from Master for 15 seconds");
   }
}

//+------------------------------------------------------------------+
//| Calculate copy lot size                                            |
//+------------------------------------------------------------------+
double CalculateLotSize(string symbol, double masterVolume)
{
   double lots;
   
   if(g_fixedLots > 0)
      lots = g_fixedLots;
   else
      lots = masterVolume * g_lotMultiplier;
   
   if(!SymbolSelect(symbol, true))
      return 0;
   
   double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double lotMin  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double lotMax  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   
   if(lotStep > 0)
      lots = MathFloor(lots / lotStep) * lotStep;
   
   if(lots < lotMin) lots = lotMin;
   if(lots > lotMax) lots = lotMax;
   if(lots > InpMaxLots) lots = InpMaxLots;
   
   return lots;
}

//+------------------------------------------------------------------+
//| Execute an open trade                                              |
//+------------------------------------------------------------------+
ulong ExecuteOpen(string symbol, string side, double lots, double sl, double tp, ulong masterTicket)
{
   if(!SymbolSelect(symbol, true))
   {
      Print("ERROR: Symbol not available: ", symbol);
      return 0;
   }
   
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   request.action    = TRADE_ACTION_DEAL;
   request.symbol    = symbol;
   request.volume    = lots;
   request.deviation = InpSlippage;
   request.magic     = InpMagicNumber;
   request.comment   = InpTradeComment + " #" + IntegerToString(masterTicket);
   
   if(side == "BUY")
   {
      request.type  = ORDER_TYPE_BUY;
      request.price = SymbolInfoDouble(symbol, SYMBOL_ASK);
   }
   else
   {
      request.type  = ORDER_TYPE_SELL;
      request.price = SymbolInfoDouble(symbol, SYMBOL_BID);
   }
   
   if(g_copySLTP)
   {
      if(sl > 0) request.sl = sl;
      if(tp > 0) request.tp = tp;
   }
   
   long fillType = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if(fillType & SYMBOL_FILLING_IOC)
      request.type_filling = ORDER_FILLING_IOC;
   else if(fillType & SYMBOL_FILLING_FOK)
      request.type_filling = ORDER_FILLING_FOK;
   else
      request.type_filling = ORDER_FILLING_RETURN;
   
   if(!OrderSend(request, result))
   {
      Print("ERROR: OrderSend failed: retcode=", result.retcode, " comment=", result.comment);
      return 0;
   }
   
   if(result.retcode != TRADE_RETCODE_DONE && result.retcode != TRADE_RETCODE_PLACED)
   {
      Print("ERROR: Order rejected: retcode=", result.retcode, " comment=", result.comment);
      return 0;
   }
   
   ulong posTicket = 0;
   if(result.deal > 0)
   {
      if(HistoryDealSelect(result.deal))
         posTicket = (ulong)HistoryDealGetInteger(result.deal, DEAL_POSITION_ID);
   }
   if(posTicket == 0) posTicket = result.order;
   
   return posTicket;
}

//+------------------------------------------------------------------+
//| Modify position SL/TP                                              |
//+------------------------------------------------------------------+
bool ModifyPositionSLTP(ulong ticket, double sl, double tp)
{
   if(!PositionSelectByTicket(ticket))
      return false;
   
   string symbol = PositionGetString(POSITION_SYMBOL);
   double currentSL = PositionGetDouble(POSITION_SL);
   double currentTP = PositionGetDouble(POSITION_TP);
   
   if(MathAbs(sl - currentSL) < 0.000001 && MathAbs(tp - currentTP) < 0.000001)
      return true;
   
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   request.action   = TRADE_ACTION_SLTP;
   request.position = ticket;
   request.symbol   = symbol;
   request.sl       = sl;
   request.tp       = tp;
   
   if(!OrderSend(request, result))
      return false;
   
   return result.retcode == TRADE_RETCODE_DONE;
}

//+------------------------------------------------------------------+
//| Close position by ticket                                           |
//+------------------------------------------------------------------+
bool ClosePositionByTicket(ulong ticket)
{
   if(!PositionSelectByTicket(ticket))
      return false;
   
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   request.action   = TRADE_ACTION_DEAL;
   request.position = ticket;
   request.symbol   = PositionGetString(POSITION_SYMBOL);
   request.volume   = PositionGetDouble(POSITION_VOLUME);
   request.deviation = InpSlippage;
   request.magic    = 0;
   
   if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
   {
      request.type  = ORDER_TYPE_SELL;
      request.price = SymbolInfoDouble(request.symbol, SYMBOL_BID);
   }
   else
   {
      request.type  = ORDER_TYPE_BUY;
      request.price = SymbolInfoDouble(request.symbol, SYMBOL_ASK);
   }
   
   long fillType = SymbolInfoInteger(request.symbol, SYMBOL_FILLING_MODE);
   if(fillType & SYMBOL_FILLING_IOC)
      request.type_filling = ORDER_FILLING_IOC;
   else if(fillType & SYMBOL_FILLING_FOK)
      request.type_filling = ORDER_FILLING_FOK;
   else
      request.type_filling = ORDER_FILLING_RETURN;
   
   if(!OrderSend(request, result))
   {
      Print("Close position failed: ", result.retcode, " - ", result.comment);
      return false;
   }
   
   return result.retcode == TRADE_RETCODE_DONE;
}

//+------------------------------------------------------------------+
//| Remove position mapping entry                                      |
//+------------------------------------------------------------------+
void RemovePositionMap(int index)
{
   int size = ArraySize(g_positionMap);
   for(int i = index; i < size - 1; i++)
      g_positionMap[i] = g_positionMap[i + 1];
   ArrayResize(g_positionMap, size - 1);
}

//+------------------------------------------------------------------+
//| Initialize ZMQ (subscriber + local replier)                        |
//+------------------------------------------------------------------+
bool InitializeZMQ()
{
   Print("Initializing ZeroMQ (Slave mode)...");
   Print("  ZMQ Version: ", ZmqVersion());
   
   if(g_zmqInitialized)
   {
      ShutdownZMQ();
      Sleep(500);
   }
   
   if(!g_zmqContext.Initialize())
   {
      Print("ERROR: Failed to create ZMQ context");
      return false;
   }
   
   //--- Create SUB socket to Master's PUB
   string dataEndpoint = "tcp://" + InpMasterAddress + ":" + IntegerToString(InpMasterDataPort);
   
   if(g_curveEnabled)
   {
      if(!g_subscriber.Socket().Create(g_zmqContext, ZMQ_SUB))
      {
         Print("ERROR: Failed to create SUB socket");
         g_zmqContext.Shutdown();
         return false;
      }
      g_subscriber.Socket().SetLinger(100);
      g_subscriber.Socket().SetHighWaterMark(10000);
      g_subscriber.Socket().SetReceiveTimeout(1);
      g_subscriber.Socket().SetCurveClient(g_masterPublicKey, g_clientPublicKey, g_clientSecretKey);
      
      g_subscriber.Socket().SetSubscribe("EVENT|");
      g_subscriber.Socket().SetSubscribe("SNAPSHOT|");
      
      if(!g_subscriber.Socket().Connect(dataEndpoint))
      {
         Print("ERROR: Failed to connect SUB socket with CURVE to ", dataEndpoint);
         g_zmqContext.Shutdown();
         return false;
      }
   }
   else
   {
      if(!g_subscriber.Initialize(g_zmqContext, dataEndpoint))
      {
         Print("ERROR: Failed to create SUB socket to ", dataEndpoint);
         g_zmqContext.Shutdown();
         return false;
      }
      g_subscriber.Socket().SetSubscribe("EVENT|");
      g_subscriber.Socket().SetSubscribe("SNAPSHOT|");
   }
   Print("  SUB socket connected to ", dataEndpoint);
   
   //--- Create local REP socket for Electron app commands
   if(InpEnableLocalCommands)
   {
      string localEndpoint = "tcp://*:" + IntegerToString(InpCommandPort);
      if(!g_localReplier.Initialize(g_zmqContext, localEndpoint))
      {
         Print("WARNING: Failed to create local REP socket on ", localEndpoint);
         Print("  App commands will not work. Port may be in use.");
      }
      else
      {
         Print("  Local REP socket bound to ", localEndpoint);
      }
   }
   
   EventSetMillisecondTimer(50);
   g_zmqInitialized = true;
   Print("ZeroMQ (Slave) initialized successfully");
   return true;
}

void ShutdownZMQ()
{
   if(!g_zmqInitialized) return;
   EventKillTimer();
   g_subscriber.Shutdown();
   g_requester.Shutdown();
   g_localReplier.Shutdown();
   g_zmqContext.Shutdown();
   g_zmqInitialized = false;
}

//+------------------------------------------------------------------+
//| Process commands from Electron app                                 |
//+------------------------------------------------------------------+
void ProcessLocalCommands()
{
   if(!g_zmqInitialized || !InpEnableLocalCommands) return;
   
   string request = "";
   if(!g_localReplier.Poll(request)) return;
   
   Print("APP CMD: ", request);
   string action = ExtractJsonValue(request, "action");
   string response = "";
   
   if(action == "PAUSE")
   {
      g_isPaused = true;
      g_statusMessage = "Slave - Paused";
      UpdateComment();
      response = "{\"success\":true,\"action\":\"PAUSE\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "RESUME")
   {
      g_isPaused = false;
      g_statusMessage = InpDevMode ? "DEV MODE - Slave Active" : "Licensed - Slave Active";
      UpdateComment();
      response = "{\"success\":true,\"action\":\"RESUME\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "STATUS")
   {
      response = BuildStatusResponse();
   }
   else if(action == "PING")
   {
      response = "{\"success\":true,\"action\":\"PING\",\"pong\":true,\"role\":\"slave\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "CONFIG")
   {
      response = StringFormat(
         "{\"success\":true,\"action\":\"CONFIG\",\"config\":{\"role\":\"slave\",\"masterAddress\":\"%s\",\"masterDataPort\":%d,\"lotMultiplier\":%.2f,\"fixedLots\":%.2f,\"invertTrades\":%s,\"copySLTP\":%s,\"curveEnabled\":%s},\"timestamp\":\"%s\"}",
         InpMasterAddress, InpMasterDataPort, g_lotMultiplier, g_fixedLots,
         g_invertTrades ? "true" : "false", g_copySLTP ? "true" : "false",
         g_curveEnabled ? "true" : "false",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
      );
   }
   else if(action == "SET_CONFIG")
   {
      // Runtime config push from Electron app — override globals without EA restart
      string invertVal = ExtractJsonValue(request, "invertTrades");
      string copySLTPVal = ExtractJsonValue(request, "copySLTP");
      string lotMultVal = ExtractJsonValue(request, "lotMultiplier");
      string fixedLotsVal = ExtractJsonValue(request, "fixedLots");
      
      if(invertVal != "")    g_invertTrades  = (invertVal == "true" || invertVal == "1");
      if(copySLTPVal != "")  g_copySLTP      = (copySLTPVal == "true" || copySLTPVal == "1");
      if(lotMultVal != "")   g_lotMultiplier = StringToDouble(lotMultVal);
      if(fixedLotsVal != "") g_fixedLots     = StringToDouble(fixedLotsVal);
      
      Print("[SET_CONFIG] invertTrades=", g_invertTrades, " copySLTP=", g_copySLTP,
            " lotMult=", g_lotMultiplier, " fixedLots=", g_fixedLots);
      
      response = StringFormat(
         "{\"success\":true,\"action\":\"SET_CONFIG\",\"applied\":{\"invertTrades\":%s,\"copySLTP\":%s,\"lotMultiplier\":%.2f,\"fixedLots\":%.2f},\"timestamp\":\"%s\"}",
         g_invertTrades ? "true" : "false", g_copySLTP ? "true" : "false",
         g_lotMultiplier, g_fixedLots,
         TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
      );
      
      UpdateComment();
   }
   else if(action == "OPEN_POSITION")
   {
      response = DirectOpenPosition(request);
   }
   else if(action == "MODIFY_POSITION")
   {
      response = DirectModifyPosition(request);
   }
   else if(action == "CLOSE_POSITION")
   {
      string posId = ExtractJsonValue(request, "positionId");
      ulong ticket = (ulong)StringToInteger(posId);
      if(ClosePositionByTicket(ticket))
         response = "{\"success\":true,\"action\":\"CLOSE_POSITION\",\"positionId\":\"" + posId + "\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
      else
         response = "{\"success\":false,\"action\":\"CLOSE_POSITION\",\"error\":\"Close failed\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "CLOSE_ALL")
   {
      response = CloseAllPositions();
   }
   else
   {
      response = "{\"success\":false,\"action\":\"UNKNOWN\",\"error\":\"Slave does not handle: " + action + "\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   
   g_localReplier.Reply(response);
}

//+------------------------------------------------------------------+
//| Build STATUS response                                              |
//+------------------------------------------------------------------+
string BuildStatusResponse()
{
   string json = "{";
   json += "\"success\":true,\"action\":\"STATUS\",";
   json += "\"type\":\"SNAPSHOT\",";
   json += "\"role\":\"slave\",";
   json += "\"platform\":\"MT5\",";
   json += "\"accountId\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   json += "\"floatingPnL\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   json += "\"status\":\"" + EscapeJson(g_statusMessage) + "\",";
   json += "\"isLicenseValid\":" + (g_isLicenseValid ? "true" : "false") + ",";
   json += "\"isPaused\":" + (g_isPaused ? "true" : "false") + ",";
   json += "\"masterConnected\":" + (g_subscriberConnected ? "true" : "false") + ",";
   json += "\"eventsReceived\":" + IntegerToString(g_eventsReceived) + ",";
   json += "\"tradesCopied\":" + IntegerToString(g_tradesCopied) + ",";
   json += "\"tradesFailed\":" + IntegerToString(g_tradesFailed) + ",";
   json += "\"mappedPositions\":" + IntegerToString(ArraySize(g_positionMap)) + ",";
   json += "\"positions\":" + BuildLocalPositionsJson();
   json += ",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"";
   json += "}";
   return json;
}

//+------------------------------------------------------------------+
//| Build local positions JSON                                         |
//+------------------------------------------------------------------+
string BuildLocalPositionsJson()
{
   string json = "[";
   int total = PositionsTotal();
   
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      
      if(i > 0) json += ",";
      
      string symbol = PositionGetString(POSITION_SYMBOL);
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      
      json += "{";
      json += "\"id\":\"" + IntegerToString(ticket) + "\",";
      json += "\"symbol\":\"" + symbol + "\",";
      json += "\"volume\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME) * 100000, 0) + ",";
      json += "\"volumeLots\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ",";
      json += "\"side\":\"" + (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
      json += "\"entryPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), digits) + ",";
      json += "\"currentPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), digits) + ",";
      
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      json += "\"stopLoss\":" + (sl > 0 ? DoubleToString(sl, digits) : "null") + ",";
      json += "\"takeProfit\":" + (tp > 0 ? DoubleToString(tp, digits) : "null") + ",";
      json += "\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + ",";
      json += "\"swap\":" + DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + ",";
      json += "\"openTime\":\"" + TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE|TIME_SECONDS) + "\",";
      json += "\"comment\":\"" + EscapeJson(PositionGetString(POSITION_COMMENT)) + "\",";
      json += "\"digits\":" + IntegerToString(digits);
      json += "}";
   }
   
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Direct position open (from app command, not from master)           |
//+------------------------------------------------------------------+
string DirectOpenPosition(string request)
{
   string symbol   = ExtractJsonValue(request, "symbol");
   string side     = ExtractJsonValue(request, "side");
   double volume   = StringToDouble(ExtractJsonValue(request, "volume"));
   double sl       = StringToDouble(ExtractJsonValue(request, "sl"));
   double tp       = StringToDouble(ExtractJsonValue(request, "tp"));
   
   if(StringLen(symbol) == 0) return "{\"success\":false,\"action\":\"OPEN_POSITION\",\"error\":\"Symbol required\"}";
   if(side != "BUY" && side != "SELL") return "{\"success\":false,\"action\":\"OPEN_POSITION\",\"error\":\"Side must be BUY or SELL\"}";
   if(volume <= 0) return "{\"success\":false,\"action\":\"OPEN_POSITION\",\"error\":\"Volume must be positive\"}";
   
   ulong ticket = ExecuteOpen(symbol, side, volume, sl, tp, 0);
   
   if(ticket > 0)
      return "{\"success\":true,\"action\":\"OPEN_POSITION\",\"ticket\":\"" + IntegerToString(ticket) + "\",\"symbol\":\"" + symbol + "\",\"side\":\"" + side + "\",\"volume\":" + DoubleToString(volume, 2) + ",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   else
      return "{\"success\":false,\"action\":\"OPEN_POSITION\",\"error\":\"OrderSend failed\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
}

//+------------------------------------------------------------------+
//| Direct position modify (from app command)                          |
//+------------------------------------------------------------------+
string DirectModifyPosition(string request)
{
   ulong ticket = (ulong)StringToInteger(ExtractJsonValue(request, "ticket"));
   double sl    = StringToDouble(ExtractJsonValue(request, "sl"));
   double tp    = StringToDouble(ExtractJsonValue(request, "tp"));
   
   if(ticket == 0) return "{\"success\":false,\"action\":\"MODIFY_POSITION\",\"error\":\"Invalid ticket\"}";
   
   if(ModifyPositionSLTP(ticket, sl, tp))
      return "{\"success\":true,\"action\":\"MODIFY_POSITION\",\"ticket\":\"" + IntegerToString(ticket) + "\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   else
      return "{\"success\":false,\"action\":\"MODIFY_POSITION\",\"error\":\"Modify failed\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
}

//+------------------------------------------------------------------+
//| Close all positions                                                |
//+------------------------------------------------------------------+
string CloseAllPositions()
{
   int closed = 0;
   string errors = "";
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(ClosePositionByTicket(ticket))
            closed++;
         else
            errors += IntegerToString(ticket) + " ";
      }
   }
   
   ArrayResize(g_positionMap, 0);
   
   return StringFormat("{\"success\":%s,\"action\":\"CLOSE_ALL\",\"closedCount\":%d,\"errors\":\"%s\",\"timestamp\":\"%s\"}",
      (StringLen(errors) == 0 ? "true" : "false"), closed, errors, TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS));
}

//+------------------------------------------------------------------+
//| Registration File (for Electron app)                               |
//+------------------------------------------------------------------+
void WriteRegistrationFile()
{
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string filename = "HedgeEdge\\" + login + ".json";
   
   int handle = FileOpen(filename, FILE_WRITE|FILE_TXT|FILE_COMMON, 0, CP_UTF8);
   if(handle == INVALID_HANDLE)
   {
      Print("WARNING: Failed to write registration file: ", filename);
      return;
   }
   
   string json = "{";
   json += "\"login\":\"" + login + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"commandPort\":" + IntegerToString(InpCommandPort) + ",";
   json += "\"role\":\"slave\",";
   json += "\"version\":\"3.0\",";
   json += "\"eventDriven\":true,";
   json += "\"masterAddress\":\"" + InpMasterAddress + "\",";
   json += "\"masterDataPort\":" + IntegerToString(InpMasterDataPort) + ",";
   json += "\"curveEnabled\":" + (g_curveEnabled ? "true" : "false") + ",";
   json += "\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"";
   json += "}";
   
   FileWriteString(handle, json);
   FileClose(handle);
   
   g_registrationFilePath = filename;
   Print("Registration file written: ", filename);
}

void DeleteRegistrationFile()
{
   if(StringLen(g_registrationFilePath) > 0)
   {
      FileDelete(g_registrationFilePath, FILE_COMMON);
      Print("Registration file deleted");
   }
}

//+------------------------------------------------------------------+
//| License Helper Functions                                           |
//+------------------------------------------------------------------+
bool InitializeDLL()
{
   int moduleHandle = GetModuleHandleW("HedgeEdgeLicense");
   if(moduleHandle == 0)
   {
      g_lastError = "HedgeEdgeLicense.dll not loaded";
      return false;
   }
   int result = InitializeLibrary();
   if(result == 0)
   {
      g_dllLoaded = true;
      return true;
   }
   g_lastError = "DLL init failed: " + IntegerToString(result);
   return false;
}

bool ValidateLicenseWithDLL(string overrideKey = "")
{
   if(!g_dllLoaded) return false;
   
   // Use override key if provided, else input key, else shared key
   string keyToUse = overrideKey;
   if(StringLen(keyToUse) == 0) keyToUse = InpLicenseKey;
   if(StringLen(keyToUse) == 0) keyToUse = g_sharedLicenseKey;
   if(StringLen(keyToUse) == 0) return false;
   
   char tokenBuf[512], errorBuf[256];
   ArrayInitialize(tokenBuf, 0);
   ArrayInitialize(errorBuf, 0);
   
   int result = ValidateLicense(keyToUse,
      IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
      AccountInfoString(ACCOUNT_COMPANY), g_deviceId,
      InpEndpointUrl, tokenBuf, errorBuf);
   
   g_lastLicenseCheck = TimeCurrent();
   if(result == 0)
   {
      g_isLicenseValid = true;
      g_lastError = "";
      g_statusMessage = "Licensed - Slave Active";
      UpdateComment();
      return true;
   }
   
   g_isLicenseValid = false;
   g_lastError = CharArrayToString(errorBuf);
   if(StringLen(g_lastError) == 0) g_lastError = "Code: " + IntegerToString(result);
   g_statusMessage = "License Invalid: " + g_lastError;
   UpdateComment();
   return false;
}

bool ValidateLicenseViaWebRequest(string overrideKey = "")
{
   // Use override key if provided, else input key, else shared key
   string keyToUse = overrideKey;
   if(StringLen(keyToUse) == 0) keyToUse = InpLicenseKey;
   if(StringLen(keyToUse) == 0) keyToUse = g_sharedLicenseKey;
   if(StringLen(keyToUse) == 0) { g_lastError = "No license key"; Print("LICENSE: No key available"); return false; }
   
   // Diagnostic: show what we're sending
   string maskedKey = StringSubstr(keyToUse, 0, 4) + "****" + StringSubstr(keyToUse, StringLen(keyToUse) - 4);
   Print("LICENSE: Validating key=", maskedKey, " endpoint=", InpEndpointUrl);
   
   string headers = "Content-Type: application/json\r\n";
   string body = "{\"licenseKey\":\"" + keyToUse + "\","
      + "\"accountId\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\","
      + "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\","
      + "\"deviceId\":\"" + g_deviceId + "\"}";
   
   char postData[], resultData[];
   string resultHeaders;
   StringToCharArray(body, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Strip null terminator – MQL5 always appends \0 which corrupts JSON for FastAPI
   int sz = ArraySize(postData);
   if(sz > 0 && postData[sz - 1] == 0)
      ArrayResize(postData, sz - 1);
   
   ResetLastError();
   int httpCode = WebRequest("POST", InpEndpointUrl, headers, 10000, postData, resultData, resultHeaders);
   int lastErr = GetLastError();
   
   Print("LICENSE: WebRequest returned httpCode=", httpCode, " lastError=", lastErr,
         " (4060=URL not whitelisted, 4014=not allowed)");
   
   if(httpCode == 200)
   {
      string response = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("LICENSE: Response (200): ", StringSubstr(response, 0, 200));
      if(ExtractJsonValue(response, "valid") == "true")
      {
         Print("LICENSE: Validation SUCCESS");
         g_isLicenseValid    = true;
         g_lastError         = "";
         g_statusMessage     = "Licensed - Slave Active";
         g_lastLicenseCheck  = TimeCurrent();
         UpdateComment();
         return true;
      }
      g_lastError = ExtractJsonValue(response, "error");
      if(StringLen(g_lastError) == 0) g_lastError = ExtractJsonValue(response, "message");
      Print("LICENSE: API returned valid!=true, error=", g_lastError);
   }
   else if(httpCode > 0)
   {
      string response = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("LICENSE: HTTP ", httpCode, " response: ", StringSubstr(response, 0, 200));
      g_lastError = "HTTP " + IntegerToString(httpCode) + ": " + ExtractJsonValue(response, "message");
   }
   else
   {
      // httpCode == -1: WebRequest failed entirely
      if(lastErr == 4060)
         g_lastError = "URL not whitelisted in MT5. Add: https://hedgeedge-railway-backend-production.up.railway.app";
      else if(lastErr == 4014)
         g_lastError = "WebRequest not allowed (enable in Tools > Options > Expert Advisors)";
      else
         g_lastError = "WebRequest failed: HTTP " + IntegerToString(httpCode) + " err=" + IntegerToString(lastErr);
      Print("LICENSE: FAILED - ", g_lastError);
   }
   g_isLicenseValid = false;
   g_statusMessage  = "License Invalid: " + g_lastError;
   g_lastLicenseCheck = TimeCurrent();
   UpdateComment();
   return false;
}

string GenerateDeviceId()
{
   string rawId = TerminalInfoString(TERMINAL_NAME) + TerminalInfoString(TERMINAL_PATH) +
      IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + AccountInfoString(ACCOUNT_SERVER);
   ulong hash = 0;
   for(int i = 0; i < StringLen(rawId); i++)
      hash = hash * 31 + StringGetCharacter(rawId, i);
   return StringFormat("%016llX", hash);
}

string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\r", "\\r");
   StringReplace(text, "\t", "\\t");
   return text;
}

string ExtractJsonValue(string json, string key)
{
   string searchKey = "\"" + key + "\":";
   int keyPos = StringFind(json, searchKey);
   if(keyPos < 0) return "";
   
   int vs = keyPos + StringLen(searchKey);
   while(vs < StringLen(json) && StringGetCharacter(json, vs) == ' ') vs++;
   if(vs >= StringLen(json)) return "";
   
   ushort fc = StringGetCharacter(json, vs);
   if(fc == '"')
   {
      vs++;
      int ve = StringFind(json, "\"", vs);
      if(ve < 0) return "";
      return StringSubstr(json, vs, ve - vs);
   }
   else
   {
      int ve = vs;
      while(ve < StringLen(json))
      {
         ushort ch = StringGetCharacter(json, ve);
         if(ch == ',' || ch == '}' || ch == ']' || ch == ' ') break;
         ve++;
      }
      return StringSubstr(json, vs, ve - vs);
   }
}

//+------------------------------------------------------------------+
//| Extract nested JSON object by key                                  |
//+------------------------------------------------------------------+
string ExtractNestedJson(string json, string key)
{
   string searchKey = "\"" + key + "\":{";
   int keyPos = StringFind(json, searchKey);
   if(keyPos < 0)
   {
      searchKey = "\"" + key + "\":{ ";
      keyPos = StringFind(json, searchKey);
   }
   if(keyPos < 0) return json;
   
   int objStart = StringFind(json, "{", keyPos + StringLen("\"" + key + "\":"));
   if(objStart < 0) return json;
   
   int depth = 0;
   int objEnd = objStart;
   for(int i = objStart; i < StringLen(json); i++)
   {
      ushort ch = StringGetCharacter(json, i);
      if(ch == '{') depth++;
      else if(ch == '}') { depth--; if(depth == 0) { objEnd = i; break; } }
   }
   
   return StringSubstr(json, objStart, objEnd - objStart + 1);
}

//+------------------------------------------------------------------+
//| Dashboard helper functions                                        |
//+------------------------------------------------------------------+
#define DASH_PREFIX    "HE_D_"
#define DASH_X         16
#define DASH_Y         30
#define DASH_W         240
#define ROW_H          17
#define HDR_H          32
#define FTR_H          20

void DashRect(string tag, int x, int y, int w, int h, color bg, int bw=0, color bc=clrNONE)
{
   string name = DASH_PREFIX + tag;
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, bc != clrNONE ? bc : bg);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, bw);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void DashLabel(string tag, int x, int y, string text, color clr, int sz=9, string fnt="Consolas")
{
   string name = DASH_PREFIX + tag;
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, sz);
   ObjectSetString(0, name, OBJPROP_FONT, fnt);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void DashDeleteAll()
{
   int total = ObjectsTotal(0);
   for(int i = total - 1; i >= 0; i--)
   {
      string n = ObjectName(0, i);
      if(StringFind(n, DASH_PREFIX) == 0) ObjectDelete(0, n);
   }
   ObjectDelete(0, "HedgeEdgeStatus");
}

//+------------------------------------------------------------------+
//| UpdateComment - Minimal branded dashboard                         |
//+------------------------------------------------------------------+
void UpdateComment()
{
   color  stClr;
   string stTxt;
   if(!g_isLicenseValid && !InpDevMode) { stClr = C'239,68,68';  stTxt = "License Error"; }
   else if(g_isPaused)                  { stClr = C'251,191,36'; stTxt = "Paused"; }
   else if(!g_subscriberConnected)      { stClr = C'251,191,36'; stTxt = "Waiting..."; }
   else                                 { stClr = C'34,197,94';  stTxt = "Connected"; }

   int y  = DASH_Y;
   int xP = DASH_X + 10;

   //--- Rows: status, mode, lots, copied/failed
   int totalH = HDR_H + (4 * ROW_H) + 6 + FTR_H;

   //--- Panel ──────────────────────────────────────────────────────
   DashRect("BG",  DASH_X, y, DASH_W, totalH, C'15,23,42', 1, C'59,130,246');
   DashRect("HDR", DASH_X, y, DASH_W, HDR_H,  C'30,41,59', 1, C'59,130,246');

   //--- Brand ──────────────────────────────────────────────────────
   DashLabel("Logo", xP, y + 7, "Hedge Edge", C'96,165,250', 12, "Segoe UI Bold");
   DashLabel("Tag",  xP + 138, y + 10, "SLAVE", C'100,116,139', 9, "Consolas");
   y += HDR_H + 4;

   //--- Status ─────────────────────────────────────────────────────
   DashLabel("St", xP, y, ">> " + stTxt, stClr);
   y += ROW_H;

   //--- Mode ───────────────────────────────────────────────────────
   string modeStr = g_invertTrades ? "Reverse" : "Mirror";
   color  modeClr = g_invertTrades ? C'34,197,94' : C'251,191,36';
   DashLabel("Mode", xP, y, "Mode  " + modeStr, modeClr);
   y += ROW_H;

   //--- Lots ───────────────────────────────────────────────────────
   string lotStr = g_fixedLots > 0
                   ? DoubleToString(g_fixedLots, 2) + " fixed"
                   : "x" + DoubleToString(g_lotMultiplier, 2);
   DashLabel("Lots", xP, y, "Lots  " + lotStr, C'148,163,184');
   y += ROW_H;

   //--- Copied / Failed ────────────────────────────────────────────
   string stats = "Copied " + IntegerToString(g_tradesCopied);
   if(g_tradesFailed > 0) stats += "  Fail " + IntegerToString(g_tradesFailed);
   color statsClr = g_tradesFailed > 0 ? C'239,68,68' : C'148,163,184';
   DashLabel("Stats", xP, y, stats, statsClr);
   y += ROW_H + 2;

   //--- Footer ─────────────────────────────────────────────────────
   DashRect("FTR", DASH_X, y, DASH_W, FTR_H, C'15,23,42');
   DashLabel("Cpy", xP, y + 3,
             "hedge-edge.com", C'71,85,105', 7, "Segoe UI");

   Comment("Hedge Edge SLAVE | " + stTxt);
   ChartRedraw(0);
}
//+------------------------------------------------------------------+
