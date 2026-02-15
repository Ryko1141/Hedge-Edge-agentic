//+------------------------------------------------------------------+
//|                                           HedgeEdgeLicense.mq4   |
//|                                   Copyright 2026, Hedge Edge     |
//|                                     https://www.hedge-edge.com   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Hedge Edge"
#property link      "https://www.hedge-edge.com"
#property version   "1.00"
#property description "Hedge Edge License EA for MT4 - Validates subscription and streams account data"
#property strict

//--- DLL imports (32-bit DLL for MT4)
#import "HedgeEdgeLicense32.dll"
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
extern string InpLicenseKey = "";                    // License Key (required)
extern string InpDeviceId = "";                      // Device ID (from app, or auto-generate)
extern string InpEndpointUrl = "https://api.hedge-edge.com/v1/license/validate"; // API Endpoint
extern int    InpPollIntervalSeconds = 600;          // License Check Interval (seconds)

extern string InpStatusChannel = "HedgeEdgeMT4";     // Status Channel (file name)
extern int    InpDataEmitInterval = 1;               // Data Emit Interval (seconds)
extern bool   InpEnableCommands = true;              // Enable Remote Commands

extern color  InpActiveColor = clrLime;              // Active License Color
extern color  InpPausedColor = clrOrange;            // Paused Color  
extern color  InpErrorColor = clrRed;                // Error Color
extern int    InpCommentLine = 0;                    // Comment Line Position

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
bool g_isLicenseValid = false;
bool g_isPaused = false;
bool g_dllLoaded = false;
string g_lastError = "";
string g_statusMessage = "Initializing...";
datetime g_lastLicenseCheck = 0;
datetime g_lastDataEmit = 0;
datetime g_tokenExpiry = 0;

int g_fileHandle = INVALID_HANDLE;
string g_deviceId = "";

// Order/Position tracking (MT4 uses orders, not positions)
struct OrderInfo
{
   int    ticket;
   string symbol;
   double lots;
   int    type;      // OP_BUY or OP_SELL
   double openPrice;
   double stopLoss;
   double takeProfit;
   double profit;
   double swap;
   double commission;
   datetime openTime;
   string comment;
   int    magicNumber;
};

OrderInfo g_orders[];

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("Hedge Edge License EA (MT4) initializing...");
   
   //--- Validate license key
   if(StringLen(InpLicenseKey) == 0)
   {
      g_statusMessage = "ERROR: License Key is required";
      UpdateComment();
      Print(g_statusMessage);
      return INIT_PARAMETERS_INCORRECT;
   }
   
   //--- Initialize DLL
   if(!InitializeDLL())
   {
      g_statusMessage = "ERROR: Failed to load HedgeEdgeLicense32.dll";
      UpdateComment();
      Print(g_statusMessage);
      return INIT_FAILED;
   }
   
   //--- Generate or use provided device ID
   if(StringLen(InpDeviceId) > 0)
   {
      g_deviceId = InpDeviceId;
   }
   else
   {
      g_deviceId = GenerateDeviceId();
   }
   
   //--- Set API endpoint
   SetEndpoint(InpEndpointUrl);
   
   //--- Initial license validation
   if(!ValidateLicenseWithDLL())
   {
      g_statusMessage = "License validation failed: " + g_lastError;
      UpdateComment();
      Print(g_statusMessage);
      return INIT_FAILED;
   }
   
   //--- Open status channel (file-based for MT4)
   if(!OpenStatusChannel())
   {
      Print("Warning: Could not open status channel. Data streaming disabled.");
   }
   
   //--- Set timer for periodic checks
   int timerInterval = MathMin(InpDataEmitInterval, InpPollIntervalSeconds);
   EventSetTimer(timerInterval);
   
   g_statusMessage = "Licensed - Active";
   g_isLicenseValid = true;
   UpdateComment();
   
   Print("Hedge Edge License EA (MT4) initialized successfully");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                   |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("Hedge Edge License EA (MT4) shutting down...");
   
   //--- Kill timer
   EventKillTimer();
   
   //--- Close channels
   CloseStatusChannel();
   
   //--- Shutdown DLL
   if(g_dllLoaded)
   {
      ClearCache();
      ShutdownLibrary();
      g_dllLoaded = false;
   }
   
   //--- Clear comment
   Comment("");
   
   //--- Remove status label
   ObjectDelete(0, "HedgeEdgeStatus");
   
   Print("Hedge Edge License EA (MT4) stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick()
{
   //--- Check if paused
   if(g_isPaused)
      return;
   
   //--- Check license validity
   if(!g_isLicenseValid)
   {
      // Attempt to revalidate if enough time has passed
      if(TimeCurrent() - g_lastLicenseCheck >= InpPollIntervalSeconds)
      {
         ValidateLicenseWithDLL();
      }
      return;
   }
   
   //--- Normal trading operations would go here
   // (This EA is for license management, not trading logic)
}

//+------------------------------------------------------------------+
//| Timer function                                                     |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime currentTime = TimeCurrent();
   
   //--- Periodic license check
   if(currentTime - g_lastLicenseCheck >= InpPollIntervalSeconds)
   {
      Print("Performing periodic license check...");
      
      if(!ValidateLicenseWithDLL())
      {
         g_isLicenseValid = false;
         g_statusMessage = "License expired/invalid: " + g_lastError;
         UpdateComment();
         Alert("Hedge Edge: License validation failed - ", g_lastError);
      }
   }
   
   //--- Check token expiry (refresh 60 seconds before)
   if(g_tokenExpiry > 0 && currentTime >= g_tokenExpiry - 60)
   {
      Print("Token expiring soon, refreshing...");
      ValidateLicenseWithDLL();
   }
   
   //--- Emit data
   if(currentTime - g_lastDataEmit >= InpDataEmitInterval)
   {
      EmitAccountData();
      g_lastDataEmit = currentTime;
   }
   
   //--- Check for commands
   if(InpEnableCommands)
   {
      ProcessCommands();
   }
}

//+------------------------------------------------------------------+
//| Initialize DLL                                                     |
//+------------------------------------------------------------------+
bool InitializeDLL()
{
   int result = InitializeLibrary();
   
   if(result == 0)
   {
      g_dllLoaded = true;
      Print("HedgeEdgeLicense32.dll loaded successfully");
      return true;
   }
   
   g_lastError = "DLL initialization failed with code: " + IntegerToString(result);
   Print(g_lastError);
   return false;
}

//+------------------------------------------------------------------+
//| Validate license using DLL                                         |
//+------------------------------------------------------------------+
bool ValidateLicenseWithDLL()
{
   if(!g_dllLoaded)
   {
      g_lastError = "DLL not loaded";
      return false;
   }
   
   char tokenBuffer[512];
   char errorBuffer[256];
   
   ArrayInitialize(tokenBuffer, 0);
   ArrayInitialize(errorBuffer, 0);
   
   string accountId = IntegerToString(AccountNumber());
   string broker = AccountCompany();
   
   int result = ValidateLicense(
      InpLicenseKey,
      accountId,
      broker,
      g_deviceId,
      InpEndpointUrl,
      tokenBuffer,
      errorBuffer
   );
   
   g_lastLicenseCheck = TimeCurrent();
   
   if(result == 0)
   {
      g_isLicenseValid = true;
      g_lastError = "";
      
      // Get token TTL to set expiry
      int ttl = GetTokenTTL();
      if(ttl > 0)
      {
         g_tokenExpiry = TimeCurrent() + ttl;
      }
      
      g_statusMessage = "Licensed - Active";
      UpdateComment();
      Print("License validated successfully. TTL: ", ttl, " seconds");
      return true;
   }
   else
   {
      g_isLicenseValid = false;
      g_lastError = CharArrayToString(errorBuffer);
      
      if(StringLen(g_lastError) == 0)
      {
         g_lastError = "Validation failed with code: " + IntegerToString(result);
      }
      
      g_statusMessage = "License Invalid: " + g_lastError;
      UpdateComment();
      Print("License validation failed: ", g_lastError);
      return false;
   }
}

//+------------------------------------------------------------------+
//| Generate device ID                                                 |
//+------------------------------------------------------------------+
string GenerateDeviceId()
{
   // Combine terminal info to create unique device ID
   string rawId = TerminalName() + 
                  TerminalPath() +
                  IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) +
                  AccountServer();
   
   // Simple hash (in production, use proper hashing)
   long hash = 0;
   for(int i = 0; i < StringLen(rawId); i++)
   {
      hash = hash * 31 + StringGetCharacter(rawId, i);
   }
   
   return StringFormat("%016llX", hash);
}

//+------------------------------------------------------------------+
//| Open status channel (file-based for MT4)                           |
//+------------------------------------------------------------------+
bool OpenStatusChannel()
{
   // MT4 uses file-based communication
   // File is stored in MQL4/Files folder
   string filePath = InpStatusChannel + ".json";
   
   g_fileHandle = FileOpen(filePath, FILE_WRITE|FILE_TXT|FILE_SHARE_READ);
   
   if(g_fileHandle == INVALID_HANDLE)
   {
      Print("Error opening status channel file: ", GetLastError());
      return false;
   }
   
   Print("Status channel opened: ", filePath);
   return true;
}

//+------------------------------------------------------------------+
//| Close status channel                                               |
//+------------------------------------------------------------------+
void CloseStatusChannel()
{
   if(g_fileHandle != INVALID_HANDLE)
   {
      FileClose(g_fileHandle);
      g_fileHandle = INVALID_HANDLE;
   }
}

//+------------------------------------------------------------------+
//| Emit account data                                                  |
//+------------------------------------------------------------------+
void EmitAccountData()
{
   if(g_fileHandle == INVALID_HANDLE)
   {
      // Try to reopen
      if(!OpenStatusChannel())
         return;
   }
   
   //--- Gather order data (MT4 uses orders, not positions)
   GatherOrders();
   
   //--- Build JSON
   string json = BuildAccountJson();
   
   //--- Write to channel
   FileSeek(g_fileHandle, 0, SEEK_SET);
   
   uint bytesWritten = FileWriteString(g_fileHandle, json);
   
   if(bytesWritten == 0)
   {
      Print("Error writing to status channel: ", GetLastError());
      FileClose(g_fileHandle);
      g_fileHandle = INVALID_HANDLE;
   }
   
   FileFlush(g_fileHandle);
}

//+------------------------------------------------------------------+
//| Gather open orders (MT4 order-based system)                        |
//+------------------------------------------------------------------+
void GatherOrders()
{
   int totalOrders = OrdersTotal();
   int openPositions = 0;
   
   // First pass: count open positions
   for(int i = 0; i < totalOrders; i++)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         int orderType = OrderType();
         // Only count market orders (OP_BUY=0, OP_SELL=1)
         if(orderType == OP_BUY || orderType == OP_SELL)
         {
            openPositions++;
         }
      }
   }
   
   ArrayResize(g_orders, openPositions);
   
   // Second pass: collect order info
   int idx = 0;
   for(int i = 0; i < totalOrders; i++)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         int orderType = OrderType();
         // Only collect market orders
         if(orderType == OP_BUY || orderType == OP_SELL)
         {
            g_orders[idx].ticket = OrderTicket();
            g_orders[idx].symbol = OrderSymbol();
            g_orders[idx].lots = OrderLots();
            g_orders[idx].type = orderType;
            g_orders[idx].openPrice = OrderOpenPrice();
            g_orders[idx].stopLoss = OrderStopLoss();
            g_orders[idx].takeProfit = OrderTakeProfit();
            g_orders[idx].profit = OrderProfit();
            g_orders[idx].swap = OrderSwap();
            g_orders[idx].commission = OrderCommission();
            g_orders[idx].openTime = OrderOpenTime();
            g_orders[idx].comment = OrderComment();
            g_orders[idx].magicNumber = OrderMagicNumber();
            idx++;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Build account JSON                                                 |
//+------------------------------------------------------------------+
string BuildAccountJson()
{
   string json = "{";
   
   //--- Timestamp
   json += "\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   
   //--- Platform info (MT4 specific)
   json += "\"platform\":\"MT4\",";
   json += "\"accountId\":\"" + IntegerToString(AccountNumber()) + "\",";
   json += "\"broker\":\"" + EscapeJson(AccountCompany()) + "\",";
   json += "\"server\":\"" + EscapeJson(AccountServer()) + "\",";
   
   //--- Account metrics (MT4 functions)
   json += "\"balance\":" + DoubleToString(AccountBalance(), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountEquity(), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountMargin(), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(AccountFreeMargin(), 2) + ",";
   
   double marginLevel = 0;
   if(AccountMargin() > 0)
   {
      marginLevel = (AccountEquity() / AccountMargin()) * 100.0;
   }
   json += "\"marginLevel\":" + DoubleToString(marginLevel, 2) + ",";
   json += "\"floatingPnL\":" + DoubleToString(AccountProfit(), 2) + ",";
   json += "\"currency\":\"" + AccountCurrency() + "\",";
   json += "\"leverage\":" + IntegerToString(AccountLeverage()) + ",";
   
   //--- Status
   json += "\"status\":\"" + EscapeJson(g_statusMessage) + "\",";
   json += "\"isLicenseValid\":" + (g_isLicenseValid ? "true" : "false") + ",";
   json += "\"isPaused\":" + (g_isPaused ? "true" : "false") + ",";
   json += "\"lastError\":" + (StringLen(g_lastError) > 0 ? "\"" + EscapeJson(g_lastError) + "\"" : "null") + ",";
   
   //--- Positions array (orders in MT4 terminology)
   json += "\"positions\":[";
   
   for(int i = 0; i < ArraySize(g_orders); i++)
   {
      if(i > 0) json += ",";
      
      json += "{";
      json += "\"id\":\"" + IntegerToString(g_orders[i].ticket) + "\",";
      json += "\"symbol\":\"" + g_orders[i].symbol + "\",";
      json += "\"volume\":" + DoubleToString(g_orders[i].lots, 2) + ",";
      json += "\"volumeLots\":" + DoubleToString(g_orders[i].lots, 2) + ",";
      json += "\"side\":\"" + (g_orders[i].type == OP_BUY ? "BUY" : "SELL") + "\",";
      json += "\"entryPrice\":" + DoubleToString(g_orders[i].openPrice, 5) + ",";
      
      // Get current price for this symbol
      double currentPrice = 0;
      if(g_orders[i].type == OP_BUY)
         currentPrice = MarketInfo(g_orders[i].symbol, MODE_BID);
      else
         currentPrice = MarketInfo(g_orders[i].symbol, MODE_ASK);
      
      json += "\"currentPrice\":" + DoubleToString(currentPrice, 5) + ",";
      json += "\"stopLoss\":" + (g_orders[i].stopLoss > 0 ? DoubleToString(g_orders[i].stopLoss, 5) : "null") + ",";
      json += "\"takeProfit\":" + (g_orders[i].takeProfit > 0 ? DoubleToString(g_orders[i].takeProfit, 5) : "null") + ",";
      json += "\"profit\":" + DoubleToString(g_orders[i].profit, 2) + ",";
      json += "\"swap\":" + DoubleToString(g_orders[i].swap, 2) + ",";
      json += "\"commission\":" + DoubleToString(g_orders[i].commission, 2) + ",";
      json += "\"openTime\":\"" + TimeToString(g_orders[i].openTime, TIME_DATE|TIME_SECONDS) + "\",";
      json += "\"comment\":\"" + EscapeJson(g_orders[i].comment) + "\",";
      json += "\"magicNumber\":" + IntegerToString(g_orders[i].magicNumber);
      json += "}";
   }
   
   json += "]}";
   
   return json;
}

//+------------------------------------------------------------------+
//| Escape JSON string                                                 |
//+------------------------------------------------------------------+
string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\r", "\\r");
   StringReplace(text, "\t", "\\t");
   return text;
}

//+------------------------------------------------------------------+
//| Process commands from app                                          |
//+------------------------------------------------------------------+
void ProcessCommands()
{
   string commandFile = InpStatusChannel + "_cmd.json";
   
   // Check if command file exists
   if(!FileIsExist(commandFile))
      return;
   
   int cmdHandle = FileOpen(commandFile, FILE_READ|FILE_TXT);
   if(cmdHandle == INVALID_HANDLE)
      return;
   
   string cmdJson = FileReadString(cmdHandle);
   FileClose(cmdHandle);
   
   // Delete command file after reading
   FileDelete(commandFile);
   
   if(StringLen(cmdJson) == 0)
      return;
   
   Print("Received command: ", cmdJson);
   
   // Parse command (simple parsing)
   string action = ExtractJsonValue(cmdJson, "action");
   string response = "";
   
   if(action == "PAUSE")
   {
      g_isPaused = true;
      g_statusMessage = "Licensed - Paused";
      UpdateComment();
      response = "{\"success\":true,\"message\":\"Trading paused\"}";
   }
   else if(action == "RESUME")
   {
      if(g_isLicenseValid)
      {
         g_isPaused = false;
         g_statusMessage = "Licensed - Active";
         UpdateComment();
         response = "{\"success\":true,\"message\":\"Trading resumed\"}";
      }
      else
      {
         response = "{\"success\":false,\"error\":\"Cannot resume: license invalid\"}";
      }
   }
   else if(action == "CLOSE_ALL")
   {
      response = CloseAllOrders();
   }
   else if(action == "CLOSE_POSITION")
   {
      string positionId = ExtractJsonValue(cmdJson, "positionId");
      response = CloseOrderById(positionId);
   }
   else if(action == "STATUS")
   {
      int openCount = 0;
      for(int i = 0; i < OrdersTotal(); i++)
      {
         if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         {
            if(OrderType() == OP_BUY || OrderType() == OP_SELL)
               openCount++;
         }
      }
      
      response = StringFormat(
         "{\"success\":true,\"isLicenseValid\":%s,\"isPaused\":%s,\"status\":\"%s\",\"openPositions\":%d}",
         g_isLicenseValid ? "true" : "false",
         g_isPaused ? "true" : "false",
         EscapeJson(g_statusMessage),
         openCount
      );
   }
   else
   {
      response = "{\"success\":false,\"error\":\"Unknown command: " + action + "\"}";
   }
   
   // Write response
   WriteCommandResponse(response);
}

//+------------------------------------------------------------------+
//| Write command response                                             |
//+------------------------------------------------------------------+
void WriteCommandResponse(string response)
{
   string responseFile = InpStatusChannel + "_resp.json";
   
   int respHandle = FileOpen(responseFile, FILE_WRITE|FILE_TXT);
   if(respHandle != INVALID_HANDLE)
   {
      FileWriteString(respHandle, response);
      FileClose(respHandle);
   }
}

//+------------------------------------------------------------------+
//| Extract JSON value (simple parser)                                 |
//+------------------------------------------------------------------+
string ExtractJsonValue(string json, string key)
{
   string searchKey = "\"" + key + "\":";
   int keyPos = StringFind(json, searchKey);
   
   if(keyPos < 0)
      return "";
   
   int valueStart = keyPos + StringLen(searchKey);
   
   // Skip whitespace
   while(valueStart < StringLen(json) && StringGetCharacter(json, valueStart) == ' ')
      valueStart++;
   
   if(valueStart >= StringLen(json))
      return "";
   
   ushort firstChar = StringGetCharacter(json, valueStart);
   
   if(firstChar == '"')
   {
      // String value
      valueStart++;
      int valueEnd = StringFind(json, "\"", valueStart);
      if(valueEnd < 0) return "";
      return StringSubstr(json, valueStart, valueEnd - valueStart);
   }
   else
   {
      // Non-string value (number, boolean, null)
      int valueEnd = valueStart;
      while(valueEnd < StringLen(json))
      {
         ushort ch = StringGetCharacter(json, valueEnd);
         if(ch == ',' || ch == '}' || ch == ']' || ch == ' ')
            break;
         valueEnd++;
      }
      return StringSubstr(json, valueStart, valueEnd - valueStart);
   }
}

//+------------------------------------------------------------------+
//| Close all orders (MT4 style)                                       |
//+------------------------------------------------------------------+
string CloseAllOrders()
{
   if(!g_isLicenseValid)
   {
      return "{\"success\":false,\"error\":\"License invalid\"}";
   }
   
   int closedCount = 0;
   string errors = "";
   
   // Close in reverse order to avoid index shifting issues
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         int orderType = OrderType();
         
         // Only close market orders
         if(orderType == OP_BUY || orderType == OP_SELL)
         {
            if(CloseOrderByTicket(OrderTicket()))
            {
               closedCount++;
            }
            else
            {
               if(StringLen(errors) > 0) errors += ", ";
               errors += IntegerToString(OrderTicket()) + ": " + IntegerToString(GetLastError());
            }
         }
      }
   }
   
   Print("Close all: ", closedCount, " orders closed");
   
   if(StringLen(errors) == 0)
   {
      return StringFormat("{\"success\":true,\"closedCount\":%d,\"errors\":[]}", closedCount);
   }
   else
   {
      return StringFormat("{\"success\":false,\"closedCount\":%d,\"errors\":[\"%s\"]}", closedCount, EscapeJson(errors));
   }
}

//+------------------------------------------------------------------+
//| Close order by ID                                                  |
//+------------------------------------------------------------------+
string CloseOrderById(string orderId)
{
   int ticket = (int)StringToInteger(orderId);
   
   if(ticket == 0)
   {
      return "{\"success\":false,\"error\":\"Invalid order ID\"}";
   }
   
   if(CloseOrderByTicket(ticket))
   {
      return "{\"success\":true}";
   }
   else
   {
      return "{\"success\":false,\"error\":\"Close failed: " + IntegerToString(GetLastError()) + "\"}";
   }
}

//+------------------------------------------------------------------+
//| Close order by ticket (MT4 style)                                  |
//+------------------------------------------------------------------+
bool CloseOrderByTicket(int ticket)
{
   if(!OrderSelect(ticket, SELECT_BY_TICKET))
   {
      return false;
   }
   
   int orderType = OrderType();
   
   // Only close market orders
   if(orderType != OP_BUY && orderType != OP_SELL)
   {
      // For pending orders, use OrderDelete
      return OrderDelete(ticket);
   }
   
   string symbol = OrderSymbol();
   double lots = OrderLots();
   double closePrice;
   int slippage = 10;
   
   RefreshRates();
   
   if(orderType == OP_BUY)
   {
      closePrice = MarketInfo(symbol, MODE_BID);
   }
   else // OP_SELL
   {
      closePrice = MarketInfo(symbol, MODE_ASK);
   }
   
   bool result = OrderClose(ticket, lots, closePrice, slippage, clrNONE);
   
   if(!result)
   {
      Print("OrderClose failed for ticket ", ticket, ": Error ", GetLastError());
   }
   
   return result;
}

//+------------------------------------------------------------------+
//| Update chart comment                                               |
//+------------------------------------------------------------------+
void UpdateComment()
{
   color textColor;
   
   if(!g_isLicenseValid)
   {
      textColor = InpErrorColor;
   }
   else if(g_isPaused)
   {
      textColor = InpPausedColor;
   }
   else
   {
      textColor = InpActiveColor;
   }
   
   string commentText = "Hedge Edge: " + g_statusMessage;
   
   // Use chart comment
   Comment(commentText);
   
   // Also create chart label for color
   string objName = "HedgeEdgeStatus";
   
   if(ObjectFind(objName) < 0)
   {
      ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
      ObjectSet(objName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSet(objName, OBJPROP_XDISTANCE, 10);
      ObjectSet(objName, OBJPROP_YDISTANCE, 20 + InpCommentLine * 20);
      ObjectSetText(objName, commentText, 10, "Arial Bold", textColor);
   }
   else
   {
      ObjectSetText(objName, commentText, 10, "Arial Bold", textColor);
   }
   
   WindowRedraw();
}
//+------------------------------------------------------------------+
