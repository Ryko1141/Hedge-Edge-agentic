//+------------------------------------------------------------------+
//|                                                  HE_prop.mq5     |
//|                         Copyright 2025, HedgEdge Technologies    |
//|                                     https://www.hedge-edge.com   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, HedgEdge Technologies"
#property link      "https://www.hedge-edge.com"
#property version   "3.10"
#property description "HE_prop - HedgEdge Prop/Master EA"
#property description "Publishes real-time trade events to HE_slave subscribers."
#property description "Uses ZMQ PUB/SUB (libzmq.dll + libsodium.dll)."
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

input group "=== ZMQ Settings ==="
input int    InpDataPort = 51810;                    // PUB Port (data/events)
input int    InpCommandPort = 51811;                 // REP Port (commands)
input bool   InpEnableCommands = true;               // Enable Command Channel
input bool   InpEnableCurve = false;                 // Enable CURVE Encryption

input group "=== Publish Settings ==="
input int    InpPublishIntervalMs = 500;             // Snapshot Interval (ms)
input int    InpHeartbeatIntervalSec = 5;            // Heartbeat Interval (s)

input group "=== Display Settings ==="
input color  InpActiveColor = clrLime;
input color  InpPausedColor = clrOrange;
input color  InpErrorColor = clrRed;

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
bool g_isLicenseValid = false;
bool g_isPaused = false;
bool g_dllLoaded = false;
bool g_zmqInitialized = false;
string g_lastError = "";
string g_statusMessage = "Initializing...";
datetime g_lastLicenseCheck = 0;
datetime g_lastHeartbeat = 0;
datetime g_lastSnapshot = 0;
string g_deviceId = "";

// ZMQ
CZmqContext   g_zmqContext;
CZmqPublisher g_publisher;
CZmqReplier   g_replier;

// CURVE
uchar g_serverPublicKey[41];
uchar g_serverSecretKey[41];
bool  g_curveEnabled = false;

// Event tracking
ulong g_eventIndex = 0;
ulong g_publishCount = 0;
ulong g_totalPublishTimeUs = 0;

// Position tracking
struct PositionInfo
{
   long     ticket;
   string   symbol;
   double   volume;
   int      type;
   double   entryPrice;
   double   currentPrice;
   double   stopLoss;
   double   takeProfit;
   double   profit;
   double   swap;
   double   commission;
   datetime openTime;
   string   comment;
};
PositionInfo g_positions[];
PositionInfo g_prevPositions[];

// Registration file
string g_registrationFilePath = "";

// Shared license key (read from FILE_COMMON if input is blank)
string g_sharedLicenseKey = "";

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
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("═══════════════════════════════════════════════════════════");
   Print("  HedgEdge MASTER EA v3.0 - Starting...");
   Print("═══════════════════════════════════════════════════════════");
   
   //--- CURVE setup
   if(InpEnableCurve)
   {
      if(CZmqCurve::GenerateKeypair(g_serverPublicKey, g_serverSecretKey))
      {
         g_curveEnabled = true;
         Print("CURVE encryption enabled. Public key: ", CZmqCurve::KeyToString(g_serverPublicKey));
      }
      else
      {
         Print("WARNING: CURVE keypair generation failed. Running without encryption.");
      }
   }
   
   //--- Initialize ZMQ
   if(!InitializeZMQ())
   {
      g_statusMessage = "ERROR: ZMQ failed - ensure libzmq.dll is in MQL5/Libraries/";
      UpdateComment();
      Alert("HedgEdge Master: libzmq.dll not found in MQL5/Libraries/");
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
   
   //--- Initialize License DLL (optional, gracefully falls back to WebRequest)
   bool dllAvailable = InitializeDLL();
   if(!dllAvailable)
   {
      Print("WARNING: HedgeEdgeLicense.dll not available, using WebRequest fallback");
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
         Print("*** DEV MODE: Running without license ***");
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
      (InpDevMode ? "DEV MODE - Master Active" : "Licensed - Master Active") :
      "Awaiting License";
   
   //--- Gather initial positions for diff tracking
   GatherPositions();
   ArrayResize(g_prevPositions, ArraySize(g_positions));
   for(int i = 0; i < ArraySize(g_positions); i++)
      g_prevPositions[i] = g_positions[i];
   
   //--- Write registration file (for Electron app auto-discovery)
   WriteRegistrationFile();
   
   //--- Publish initial CONNECTED event
   PublishConnectedEvent();
   
   UpdateComment();
   Print("  Master EA initialized on port ", InpDataPort);
   Print("  CURVE: ", g_curveEnabled ? "ENABLED" : "disabled");
   Print("  Positions: ", ArraySize(g_positions));
   Print("═══════════════════════════════════════════════════════════");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("═══════════════════════════════════════════════════════════");
   Print("  HedgEdge PROP EA - Shutting down...");
   
   PublishEvent("DISCONNECTED", "{\"reason\":" + IntegerToString(reason) + "}");
   Sleep(100);
   
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
   Print("  Master EA stopped. Reason: ", reason);
   Print("═══════════════════════════════════════════════════════════");
}

//+------------------------------------------------------------------+
//| Timer handler - runs every InpPublishIntervalMs even without ticks|
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!g_zmqInitialized) return;
   
   //--- Process commands from app (works even on weekends)
   ProcessCommands();
   
   //--- Heartbeat
   if(TimeCurrent() - g_lastHeartbeat >= InpHeartbeatIntervalSec)
   {
      PublishHeartbeat();
      g_lastHeartbeat = TimeCurrent();
   }
   
   //--- License periodic recheck
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
         Alert("HedgEdge: License is no longer valid — ", g_lastError);
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
   if(!g_zmqInitialized || !g_isLicenseValid) return;
   
   //--- Periodic snapshot for reconciliation
   static ulong lastSnapshotMs = 0;
   ulong now = GetTickCount64();
   if(now - lastSnapshotMs >= (ulong)InpPublishIntervalMs)
   {
      PublishSnapshot();
      lastSnapshotMs = now;
   }
}

//+------------------------------------------------------------------+
//| Trade Transaction handler - instant event publishing               |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(!g_zmqInitialized || g_isPaused || !g_isLicenseValid) return;
   
   //--- DEAL_ADD is the definitive event for position open/close
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      //--- Need to select the deal from history to get full info
      if(!HistoryDealSelect(trans.deal))
      {
         // Fallback: still publish snapshot for safety
         GatherPositions();
         PublishSnapshot();
         return;
      }
      
      long entry     = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      long dealType  = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
      double volume  = HistoryDealGetDouble(trans.deal, DEAL_VOLUME);
      double price   = HistoryDealGetDouble(trans.deal, DEAL_PRICE);
      double profit  = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
      double swap    = HistoryDealGetDouble(trans.deal, DEAL_SWAP);
      double comm    = HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
      string symbol  = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
      ulong  posId   = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
      string comment = HistoryDealGetString(trans.deal, DEAL_COMMENT);
      
      // Skip non-trade deals (balance, credit, etc.)
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
         return;
      
      string side = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      
      // Get SL/TP from the position if it still exists
      double sl = 0, tp = 0;
      if(PositionSelectByTicket(posId))
      {
         sl = PositionGetDouble(POSITION_SL);
         tp = PositionGetDouble(POSITION_TP);
      }
      
      string dataJson = "{";
      dataJson += "\"deal\":" + IntegerToString(trans.deal) + ",";
      dataJson += "\"position\":" + IntegerToString(posId) + ",";
      dataJson += "\"symbol\":\"" + symbol + "\",";
      dataJson += "\"volume\":" + DoubleToString(volume, 2) + ",";
      dataJson += "\"price\":" + DoubleToString(price, (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS)) + ",";
      dataJson += "\"profit\":" + DoubleToString(profit, 2) + ",";
      dataJson += "\"swap\":" + DoubleToString(swap, 2) + ",";
      dataJson += "\"commission\":" + DoubleToString(comm, 2) + ",";
      dataJson += "\"type\":\"" + side + "\",";
      dataJson += "\"stopLoss\":" + (sl > 0 ? DoubleToString(sl, (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS)) : "null") + ",";
      dataJson += "\"takeProfit\":" + (tp > 0 ? DoubleToString(tp, (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS)) : "null") + ",";
      dataJson += "\"comment\":\"" + EscapeJson(comment) + "\",";
      dataJson += "\"digits\":" + IntegerToString((int)SymbolInfoInteger(symbol, SYMBOL_DIGITS));
      
      if(entry == DEAL_ENTRY_IN)
      {
         dataJson += ",\"entry\":\"IN\"";
         dataJson += "}";
         Print(">> POSITION_OPENED: ", symbol, " ", side, " ", DoubleToString(volume, 2), " @ ", DoubleToString(price, 5), " #", posId);
         PublishEvent("POSITION_OPENED", dataJson);
      }
      else if(entry == DEAL_ENTRY_OUT)
      {
         dataJson += ",\"entry\":\"OUT\"";
         dataJson += "}";
         Print(">> POSITION_CLOSED: ", symbol, " ", side, " ", DoubleToString(volume, 2), " @ ", DoubleToString(price, 5), " P&L=", DoubleToString(profit, 2), " #", posId);
         PublishEvent("POSITION_CLOSED", dataJson);
      }
      else if(entry == DEAL_ENTRY_INOUT)
      {
         dataJson += ",\"entry\":\"INOUT\"";
         dataJson += "}";
         Print(">> POSITION_REVERSED: ", symbol, " #", posId);
         PublishEvent("POSITION_REVERSED", dataJson);
      }
      
      //--- Also publish an ACCOUNT_UPDATE after the trade for full reconciliation
      Sleep(50); // Brief delay to let MT5 update position list
      GatherPositions();
      PublishAccountUpdate();
      
      //--- Store for SL/TP diff
      ArrayResize(g_prevPositions, ArraySize(g_positions));
      for(int i = 0; i < ArraySize(g_positions); i++)
         g_prevPositions[i] = g_positions[i];
   }
   else if(trans.type == TRADE_TRANSACTION_POSITION)
   {
      //--- SL/TP modification detection
      GatherPositions();
      DetectSLTPChanges();
      
      //--- Update previous state
      ArrayResize(g_prevPositions, ArraySize(g_positions));
      for(int i = 0; i < ArraySize(g_positions); i++)
         g_prevPositions[i] = g_positions[i];
   }
}

//+------------------------------------------------------------------+
//| Detect SL/TP modifications by diffing current vs previous        |
//+------------------------------------------------------------------+
void DetectSLTPChanges()
{
   for(int i = 0; i < ArraySize(g_positions); i++)
   {
      for(int j = 0; j < ArraySize(g_prevPositions); j++)
      {
         if(g_positions[i].ticket == g_prevPositions[j].ticket)
         {
            bool slChanged = MathAbs(g_positions[i].stopLoss - g_prevPositions[j].stopLoss) > 0.000001;
            bool tpChanged = MathAbs(g_positions[i].takeProfit - g_prevPositions[j].takeProfit) > 0.000001;
            
            if(slChanged || tpChanged)
            {
               int digits = (int)SymbolInfoInteger(g_positions[i].symbol, SYMBOL_DIGITS);
               string dataJson = "{";
               dataJson += "\"position\":" + IntegerToString(g_positions[i].ticket) + ",";
               dataJson += "\"symbol\":\"" + g_positions[i].symbol + "\",";
               dataJson += "\"type\":\"" + (g_positions[i].type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
               dataJson += "\"stopLoss\":" + (g_positions[i].stopLoss > 0 ? DoubleToString(g_positions[i].stopLoss, digits) : "null") + ",";
               dataJson += "\"takeProfit\":" + (g_positions[i].takeProfit > 0 ? DoubleToString(g_positions[i].takeProfit, digits) : "null") + ",";
               dataJson += "\"prevStopLoss\":" + (g_prevPositions[j].stopLoss > 0 ? DoubleToString(g_prevPositions[j].stopLoss, digits) : "null") + ",";
               dataJson += "\"prevTakeProfit\":" + (g_prevPositions[j].takeProfit > 0 ? DoubleToString(g_prevPositions[j].takeProfit, digits) : "null");
               dataJson += "}";
               
               Print(">> POSITION_MODIFIED: ", g_positions[i].symbol, " #", g_positions[i].ticket,
                     " SL:", DoubleToString(g_positions[i].stopLoss, digits),
                     " TP:", DoubleToString(g_positions[i].takeProfit, digits));
               PublishEvent("POSITION_MODIFIED", dataJson);
            }
            break;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Publish a discrete event with topic prefix                        |
//+------------------------------------------------------------------+
void PublishEvent(string eventType, string dataJson)
{
   if(!g_zmqInitialized) return;
   
   g_eventIndex++;
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   
   string json = "{";
   json += "\"type\":\"" + eventType + "\",";
   json += "\"eventIndex\":" + IntegerToString(g_eventIndex) + ",";
   json += "\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"platform\":\"MT5\",";
   json += "\"accountId\":\"" + login + "\",";
   json += "\"role\":\"master\",";
   json += "\"data\":" + dataJson;
   json += "}";
   
   // Publish with topic prefix for filtered subscription
   g_publisher.PublishWithTopic("EVENT", json);
}

//+------------------------------------------------------------------+
//| Publish CONNECTED event (initial state)                            |
//+------------------------------------------------------------------+
void PublishConnectedEvent()
{
   GatherPositions();
   string dataJson = BuildAccountDataJson();
   PublishEvent("CONNECTED", dataJson);
}

//+------------------------------------------------------------------+
//| Publish ACCOUNT_UPDATE event (full state after trade)              |
//+------------------------------------------------------------------+
void PublishAccountUpdate()
{
   string dataJson = BuildAccountDataJson();
   PublishEvent("ACCOUNT_UPDATE", dataJson);
}

//+------------------------------------------------------------------+
//| Publish lightweight HEARTBEAT                                      |
//+------------------------------------------------------------------+
void PublishHeartbeat()
{
   // Get server time for EOD tracking (broker's timezone)
   datetime serverTime = TimeCurrent();
   
   string json = "{";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"profit\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   json += "\"positionCount\":" + IntegerToString(PositionsTotal()) + ",";
   json += "\"isLicenseValid\":" + (g_isLicenseValid ? "true" : "false") + ",";
   json += "\"isPaused\":" + (g_isPaused ? "true" : "false") + ",";
   json += "\"serverTime\":\"" + TimeToString(serverTime, TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"serverTimeUnix\":" + IntegerToString((long)serverTime);
   json += "}";
   
   PublishEvent("HEARTBEAT", json);
}

//+------------------------------------------------------------------+
//| Publish periodic SNAPSHOT (reconciliation backup)                  |
//+------------------------------------------------------------------+
void PublishSnapshot()
{
   if(!g_zmqInitialized) return;
   
   ulong startTime = GetMicrosecondCount();
   GatherPositions();
   
   // Build full legacy SNAPSHOT format (backwards compatible)
   string json = BuildFullSnapshotJson("SNAPSHOT");
   
   // Publish with SNAPSHOT topic (separate from EVENT)
   g_publisher.PublishWithTopic("SNAPSHOT", json);
   
   g_publishCount++;
   g_totalPublishTimeUs += (GetMicrosecondCount() - startTime);
}

//+------------------------------------------------------------------+
//| Build full snapshot JSON (legacy format for reconciliation)        |
//+------------------------------------------------------------------+
string BuildFullSnapshotJson(string messageType)
{
   double avgLatencyUs = (g_publishCount > 0) ? (double)g_totalPublishTimeUs / g_publishCount : 0;
   datetime serverTime = TimeCurrent();
   
   string json = "{";
   json += "\"type\":\"" + messageType + "\",";
   json += "\"timestamp\":\"" + TimeToString(serverTime, TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"serverTime\":\"" + TimeToString(serverTime, TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"serverTimeUnix\":" + IntegerToString((long)serverTime) + ",";
   json += "\"platform\":\"MT5\",";
   json += "\"role\":\"master\",";
   json += "\"accountId\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   
   double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   json += "\"marginLevel\":" + (marginLevel > 0 ? DoubleToString(marginLevel, 2) : "null") + ",";
   
   json += "\"floatingPnL\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   json += "\"status\":\"" + EscapeJson(g_statusMessage) + "\",";
   json += "\"isLicenseValid\":" + (g_isLicenseValid ? "true" : "false") + ",";
   json += "\"isPaused\":" + (g_isPaused ? "true" : "false") + ",";
   json += "\"lastError\":" + (StringLen(g_lastError) > 0 ? "\"" + EscapeJson(g_lastError) + "\"" : "null") + ",";
   json += "\"zmqMode\":true,";
   json += "\"eventDriven\":true,";
   json += "\"snapshotIndex\":" + IntegerToString(g_eventIndex) + ",";
   json += "\"avgLatencyUs\":" + DoubleToString(avgLatencyUs, 2) + ",";
   json += "\"positions\":" + BuildPositionsJson();
   json += "}";
   
   return json;
}

//+------------------------------------------------------------------+
//| Build account data for event payloads                              |
//+------------------------------------------------------------------+
string BuildAccountDataJson()
{
   string json = "{";
   json += "\"accountId\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   
   double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   json += "\"marginLevel\":" + (marginLevel > 0 ? DoubleToString(marginLevel, 2) : "null") + ",";
   
   json += "\"floatingPnL\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   json += "\"status\":\"" + EscapeJson(g_statusMessage) + "\",";
   json += "\"isLicenseValid\":" + (g_isLicenseValid ? "true" : "false") + ",";
   json += "\"isPaused\":" + (g_isPaused ? "true" : "false") + ",";
   json += "\"lastError\":" + (StringLen(g_lastError) > 0 ? "\"" + EscapeJson(g_lastError) + "\"" : "null") + ",";
   json += "\"eventDriven\":true,";
   json += "\"positions\":" + BuildPositionsJson();
   json += "}";
   
   return json;
}

//+------------------------------------------------------------------+
//| Build positions JSON array                                         |
//+------------------------------------------------------------------+
string BuildPositionsJson()
{
   string json = "[";
   for(int i = 0; i < ArraySize(g_positions); i++)
   {
      if(i > 0) json += ",";
      int digits = (int)SymbolInfoInteger(g_positions[i].symbol, SYMBOL_DIGITS);
      
      json += "{";
      json += "\"id\":\"" + IntegerToString(g_positions[i].ticket) + "\",";
      json += "\"symbol\":\"" + g_positions[i].symbol + "\",";
      json += "\"volume\":" + DoubleToString(g_positions[i].volume * 100000, 0) + ",";
      json += "\"volumeLots\":" + DoubleToString(g_positions[i].volume, 2) + ",";
      json += "\"side\":\"" + (g_positions[i].type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
      json += "\"entryPrice\":" + DoubleToString(g_positions[i].entryPrice, digits) + ",";
      json += "\"currentPrice\":" + DoubleToString(g_positions[i].currentPrice, digits) + ",";
      json += "\"stopLoss\":" + (g_positions[i].stopLoss > 0 ? DoubleToString(g_positions[i].stopLoss, digits) : "null") + ",";
      json += "\"takeProfit\":" + (g_positions[i].takeProfit > 0 ? DoubleToString(g_positions[i].takeProfit, digits) : "null") + ",";
      json += "\"profit\":" + DoubleToString(g_positions[i].profit, 2) + ",";
      json += "\"swap\":" + DoubleToString(g_positions[i].swap, 2) + ",";
      json += "\"commission\":" + DoubleToString(g_positions[i].commission, 2) + ",";
      json += "\"openTime\":\"" + TimeToString(g_positions[i].openTime, TIME_DATE|TIME_SECONDS) + "\",";
      json += "\"comment\":\"" + EscapeJson(g_positions[i].comment) + "\",";
      json += "\"digits\":" + IntegerToString(digits);
      json += "}";
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Gather open positions                                              |
//+------------------------------------------------------------------+
void GatherPositions()
{
   int total = PositionsTotal();
   ArrayResize(g_positions, total);
   
   for(int i = 0; i < total; i++)
   {
      if(PositionSelectByTicket(PositionGetTicket(i)))
      {
         g_positions[i].ticket     = PositionGetInteger(POSITION_TICKET);
         g_positions[i].symbol     = PositionGetString(POSITION_SYMBOL);
         g_positions[i].volume     = PositionGetDouble(POSITION_VOLUME);
         g_positions[i].type       = (int)PositionGetInteger(POSITION_TYPE);
         g_positions[i].entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         g_positions[i].stopLoss   = PositionGetDouble(POSITION_SL);
         g_positions[i].takeProfit = PositionGetDouble(POSITION_TP);
         g_positions[i].profit     = PositionGetDouble(POSITION_PROFIT);
         g_positions[i].swap       = PositionGetDouble(POSITION_SWAP);
         g_positions[i].commission = 0;
         g_positions[i].openTime   = (datetime)PositionGetInteger(POSITION_TIME);
         g_positions[i].comment    = PositionGetString(POSITION_COMMENT);
         
         string sym = g_positions[i].symbol;
         g_positions[i].currentPrice = (g_positions[i].type == POSITION_TYPE_BUY) ? 
            SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
      }
   }
}

//+------------------------------------------------------------------+
//| Initialize ZMQ                                                     |
//+------------------------------------------------------------------+
bool InitializeZMQ()
{
   Print("Initializing ZeroMQ...");
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
   
   //--- Create PUB socket
   string dataEndpoint = "tcp://*:" + IntegerToString(InpDataPort);
   
   // If CURVE enabled, set server key BEFORE bind
   if(g_curveEnabled)
   {
      if(!g_publisher.Socket().Create(g_zmqContext, ZMQ_PUB))
      {
         Print("ERROR: Failed to create PUB socket");
         g_zmqContext.Shutdown();
         return false;
      }
      g_publisher.Socket().SetLinger(100);
      g_publisher.Socket().SetHighWaterMark(1000);
      g_publisher.Socket().SetSendTimeout(100);
      g_publisher.Socket().SetCurveServer(g_serverSecretKey);
      if(!g_publisher.Socket().Bind(dataEndpoint))
      {
         Print("ERROR: Failed to bind PUB socket with CURVE on ", dataEndpoint);
         g_zmqContext.Shutdown();
         return false;
      }
   }
   else
   {
      if(!g_publisher.Initialize(g_zmqContext, dataEndpoint))
      {
         Print("ERROR: Failed to create PUB socket on ", dataEndpoint);
         g_zmqContext.Shutdown();
         return false;
      }
   }
   Print("  PUB socket bound to ", dataEndpoint);
   
   //--- Create REP socket
   if(InpEnableCommands)
   {
      string cmdEndpoint = "tcp://*:" + IntegerToString(InpCommandPort);
      
      if(g_curveEnabled)
      {
         if(!g_replier.Socket().Create(g_zmqContext, ZMQ_REP))
         {
            Print("ERROR: Failed to create REP socket");
            g_publisher.Shutdown();
            g_zmqContext.Shutdown();
            return false;
         }
         g_replier.Socket().SetLinger(100);
         g_replier.Socket().SetReceiveTimeout(10);
         g_replier.Socket().SetSendTimeout(1000);
         g_replier.Socket().SetCurveServer(g_serverSecretKey);
         if(!g_replier.Socket().Bind(cmdEndpoint))
         {
            Print("ERROR: Failed to bind REP socket with CURVE");
            g_publisher.Shutdown();
            g_zmqContext.Shutdown();
            return false;
         }
      }
      else
      {
         if(!g_replier.Initialize(g_zmqContext, cmdEndpoint))
         {
            Print("ERROR: Failed to create REP socket");
            g_publisher.Shutdown();
            g_zmqContext.Shutdown();
            return false;
         }
      }
      Print("  REP socket bound to ", cmdEndpoint);
   }
   
   EventSetMillisecondTimer(InpPublishIntervalMs);
   g_zmqInitialized = true;
   Print("ZeroMQ initialized successfully");
   return true;
}

void ShutdownZMQ()
{
   if(!g_zmqInitialized) return;
   EventKillTimer();
   g_replier.Shutdown();
   g_publisher.Shutdown();
   g_zmqContext.Shutdown();
   g_zmqInitialized = false;
}

//+------------------------------------------------------------------+
//| Process incoming commands                                          |
//+------------------------------------------------------------------+
void ProcessCommands()
{
   if(!g_zmqInitialized || !InpEnableCommands) return;
   
   string request = "";
   if(!g_replier.Poll(request)) return;
   
   Print("CMD: ", request);
   string action = ExtractJsonValue(request, "action");
   string response = "";
   
   if(action == "PAUSE")
   {
      g_isPaused = true;
      g_statusMessage = "Master - Paused";
      UpdateComment();
      response = "{\"success\":true,\"action\":\"PAUSE\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "RESUME")
   {
      g_isPaused = false;
      g_statusMessage = InpDevMode ? "DEV MODE - Master Active" : "Licensed - Master Active";
      UpdateComment();
      response = "{\"success\":true,\"action\":\"RESUME\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "STATUS")
   {
      GatherPositions();
      response = BuildFullSnapshotJson("STATUS_RESPONSE");
   }
   else if(action == "PING")
   {
      response = "{\"success\":true,\"action\":\"PING\",\"pong\":true,\"role\":\"master\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else if(action == "CONFIG")
   {
      response = StringFormat(
         "{\"success\":true,\"action\":\"CONFIG\",\"config\":{\"role\":\"master\",\"eventDriven\":true,\"dataPort\":%d,\"commandPort\":%d,\"heartbeatIntervalMs\":%d,\"publishIntervalMs\":%d,\"curveEnabled\":%s},\"timestamp\":\"%s\"}",
         InpDataPort, InpCommandPort, InpHeartbeatIntervalSec * 1000, InpPublishIntervalMs,
         g_curveEnabled ? "true" : "false",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
      );
   }
   else if(action == "GET_HISTORY")
   {
      response = BuildHistoryResponse(request);
   }
   else if(action == "GET_CURVE_KEY")
   {
      if(g_curveEnabled)
         response = "{\"success\":true,\"action\":\"GET_CURVE_KEY\",\"publicKey\":\"" + CZmqCurve::KeyToString(g_serverPublicKey) + "\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
      else
         response = "{\"success\":false,\"action\":\"GET_CURVE_KEY\",\"error\":\"CURVE not enabled\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   else
   {
      response = "{\"success\":false,\"action\":\"UNKNOWN\",\"error\":\"Master does not handle: " + action + "\",\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   }
   
   g_replier.Reply(response);
}

//+------------------------------------------------------------------+
//| Build GET_HISTORY response                                         |
//+------------------------------------------------------------------+
string BuildHistoryResponse(string request)
{
   string daysStr = ExtractJsonValue(request, "days");
   int days = (int)StringToInteger(daysStr);
   if(days <= 0) days = 30;
   
   datetime from = TimeCurrent() - days * 86400;
   if(!HistorySelect(from, TimeCurrent()))
      return "{\"success\":false,\"action\":\"GET_HISTORY\",\"error\":\"HistorySelect failed\"}";
   
   int totalDeals = HistoryDealsTotal();
   string response = "{\"success\":true,\"action\":\"GET_HISTORY\",\"accountId\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",\"deals\":[";
   
   bool first = true;
   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      
      long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;
      
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      string entryStr = "OTHER";
      if(entry == DEAL_ENTRY_IN) entryStr = "IN";
      if(entry == DEAL_ENTRY_OUT) entryStr = "OUT";
      if(entry == DEAL_ENTRY_INOUT) entryStr = "INOUT";
      
      if(!first) response += ",";
      first = false;
      
      response += "{";
      response += "\"ticket\":" + IntegerToString(ticket) + ",";
      response += "\"positionId\":" + IntegerToString(HistoryDealGetInteger(ticket, DEAL_POSITION_ID)) + ",";
      response += "\"symbol\":\"" + HistoryDealGetString(ticket, DEAL_SYMBOL) + "\",";
      response += "\"type\":\"" + (dealType == DEAL_TYPE_BUY ? "BUY" : "SELL") + "\",";
      response += "\"entry\":\"" + entryStr + "\",";
      response += "\"volume\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_VOLUME), 2) + ",";
      response += "\"price\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), 5) + ",";
      response += "\"profit\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2) + ",";
      response += "\"swap\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_SWAP), 2) + ",";
      response += "\"commission\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2) + ",";
      response += "\"time\":\"" + TimeToString((datetime)HistoryDealGetInteger(ticket, DEAL_TIME), TIME_DATE|TIME_SECONDS) + "\",";
      response += "\"comment\":\"" + EscapeJson(HistoryDealGetString(ticket, DEAL_COMMENT)) + "\"";
      response += "}";
   }
   
   response += "],\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
   return response;
}

//+------------------------------------------------------------------+
//| Registration File (for Electron app auto-discovery)                |
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
   json += "\"dataPort\":" + IntegerToString(InpDataPort) + ",";
   json += "\"commandPort\":" + IntegerToString(InpCommandPort) + ",";
   json += "\"role\":\"master\",";
   json += "\"version\":\"3.0\",";
   json += "\"eventDriven\":true,";
   json += "\"curveEnabled\":" + (g_curveEnabled ? "true" : "false") + ",";
   if(g_curveEnabled)
      json += "\"curvePublicKey\":\"" + CZmqCurve::KeyToString(g_serverPublicKey) + "\",";
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
      g_statusMessage = "Licensed - Master Active";
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
         g_statusMessage     = "Licensed - Master Active";
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
   else                                 { stClr = C'34,197,94';  stTxt = "Connected"; }

   int y  = DASH_Y;
   int xP = DASH_X + 10;
   int totalH = HDR_H + (3 * ROW_H) + 6 + FTR_H;

   //--- Panel ──────────────────────────────────────────────────────
   DashRect("BG",  DASH_X, y, DASH_W, totalH, C'15,23,42', 1, C'59,130,246');
   DashRect("HDR", DASH_X, y, DASH_W, HDR_H,  C'30,41,59', 1, C'59,130,246');

   //--- Brand ──────────────────────────────────────────────────────
   DashLabel("Logo", xP, y + 7, "Hedge Edge", C'96,165,250', 12, "Segoe UI Bold");
   DashLabel("Tag",  xP + 138, y + 10, "PROP", C'100,116,139', 9, "Consolas");
   y += HDR_H + 4;

   //--- Status dot + text ──────────────────────────────────────────
   DashLabel("St", xP, y, ">> " + stTxt, stClr);
   y += ROW_H;

   //--- Positions ──────────────────────────────────────────────────
   DashLabel("Pos", xP, y,
             "Positions  " + IntegerToString(ArraySize(g_positions)),
             C'148,163,184');
   y += ROW_H;

   //--- Published ──────────────────────────────────────────────────
   DashLabel("Pub", xP, y,
             "Published  " + IntegerToString(g_publishCount),
             C'148,163,184');
   y += ROW_H + 2;

   //--- Footer ─────────────────────────────────────────────────────
   DashRect("FTR", DASH_X, y, DASH_W, FTR_H, C'15,23,42');
   DashLabel("Cpy", xP, y + 3,
             "hedge-edge.com", C'71,85,105', 7, "Segoe UI");

   Comment("Hedge Edge PROP | " + stTxt);
   ChartRedraw(0);
}
//+------------------------------------------------------------------+
