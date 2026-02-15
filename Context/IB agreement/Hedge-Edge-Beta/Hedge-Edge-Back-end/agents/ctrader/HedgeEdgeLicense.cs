// ============================================================================
// Hedge Edge License cBot for cTrader
// Version: 1.0.0
// Copyright (c) 2026 Hedge Edge
// ============================================================================
// This cBot validates a Hedge Edge monthly subscription license and streams
// account data to the local Hedge Edge application.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using cAlgo.API;
using cAlgo.API.Indicators;
using cAlgo.API.Internals;
using cAlgo.Indicators;

namespace HedgeEdge
{
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class HedgeEdgeLicense : Robot
    {
        #region Parameters

        [Parameter("License Key", DefaultValue = "", Group = "License")]
        public string LicenseKey { get; set; }

        [Parameter("Device ID", DefaultValue = "", Group = "License")]
        public string DeviceId { get; set; }

        [Parameter("API Endpoint", DefaultValue = "https://api.hedge-edge.com/v1/license/validate", Group = "License")]
        public string EndpointUrl { get; set; }

        [Parameter("Poll Interval (seconds)", DefaultValue = 600, MinValue = 60, MaxValue = 3600, Group = "License")]
        public int PollIntervalSeconds { get; set; }

        [Parameter("Status Channel (pipe name)", DefaultValue = "HedgeEdgeCTrader", Group = "Communication")]
        public string StatusChannel { get; set; }

        [Parameter("Enable Commands", DefaultValue = true, Group = "Communication")]
        public bool EnableCommands { get; set; }

        [Parameter("Data Emit Interval (seconds)", DefaultValue = 1, MinValue = 1, MaxValue = 60, Group = "Communication")]
        public int DataEmitIntervalSeconds { get; set; }

        #endregion

        #region Private Fields

        private HttpClient _httpClient;
        private bool _isLicenseValid;
        private string _cachedToken;
        private DateTime _tokenExpiry;
        private DateTime _lastLicenseCheck;
        private DateTime _lastDataEmit;
        private string _lastError;
        private int _retryCount;
        private const int MaxRetries = 5;
        private const int BaseRetryDelayMs = 1000;

        private NamedPipeServerStream _pipeServer;
        private StreamWriter _pipeWriter;
        private Thread _commandListenerThread;
        private CancellationTokenSource _cancellationSource;
        private bool _isPaused;
        private readonly object _lockObject = new object();

        private string _statusMessage = "Initializing...";

        #endregion

        #region Lifecycle Methods

        protected override void OnStart()
        {
            Print("Hedge Edge License cBot starting...");
            
            // Validate required parameters
            if (string.IsNullOrWhiteSpace(LicenseKey))
            {
                _statusMessage = "ERROR: License Key is required";
                Print(_statusMessage);
                Chart.DrawStaticText("HedgeEdgeStatus", _statusMessage, VerticalAlignment.Top, HorizontalAlignment.Left, Color.Red);
                Stop();
                return;
            }

            // Generate device ID if not provided
            if (string.IsNullOrWhiteSpace(DeviceId))
            {
                DeviceId = GenerateDeviceId();
            }

            // Initialize HTTP client with timeout
            // Note: No custom SSL handler - uses default certificate validation for security
            _httpClient = new HttpClient()
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            _cancellationSource = new CancellationTokenSource();
            _lastLicenseCheck = DateTime.MinValue;
            _lastDataEmit = DateTime.MinValue;
            _isLicenseValid = false;
            _isPaused = false;

            // Initial license validation
            ValidateLicenseAsync().Wait();

            if (!_isLicenseValid)
            {
                _statusMessage = $"License validation failed: {_lastError}";
                Print(_statusMessage);
                Chart.DrawStaticText("HedgeEdgeStatus", _statusMessage, VerticalAlignment.Top, HorizontalAlignment.Left, Color.Red);
                Stop();
                return;
            }

            // Start the data pipe server
            StartPipeServer();

            // Start command listener if enabled
            if (EnableCommands)
            {
                StartCommandListener();
            }

            _statusMessage = "Licensed - Active";
            UpdateStatusDisplay();
            Print("Hedge Edge License cBot initialized successfully.");
        }

        protected override void OnTick()
        {
            // Check if paused
            if (_isPaused)
            {
                return;
            }

            // Periodic license revalidation
            if ((DateTime.UtcNow - _lastLicenseCheck).TotalSeconds >= PollIntervalSeconds)
            {
                ValidateLicenseAsync().Wait();
                
                if (!_isLicenseValid)
                {
                    _statusMessage = $"License expired/invalid: {_lastError}";
                    UpdateStatusDisplay();
                    return;
                }
            }

            // Token refresh before expiry (refresh 60 seconds before expiry)
            if (_tokenExpiry != DateTime.MinValue && DateTime.UtcNow >= _tokenExpiry.AddSeconds(-60))
            {
                Print("Token expiring soon, refreshing...");
                ValidateLicenseAsync().Wait();
            }

            // Emit data at configured interval
            if ((DateTime.UtcNow - _lastDataEmit).TotalSeconds >= DataEmitIntervalSeconds)
            {
                EmitAccountData();
                _lastDataEmit = DateTime.UtcNow;
            }
        }

        protected override void OnStop()
        {
            Print("Hedge Edge License cBot stopping...");

            _cancellationSource?.Cancel();

            // Close pipe connections
            try
            {
                _pipeWriter?.Close();
                _pipeServer?.Close();
                _pipeServer?.Dispose();
            }
            catch (Exception ex)
            {
                Print($"Error closing pipe: {ex.Message}");
            }

            // Wait for command listener thread
            _commandListenerThread?.Join(1000);

            _httpClient?.Dispose();
            _cancellationSource?.Dispose();

            Print("Hedge Edge License cBot stopped.");
        }

        protected override void OnError(Error error)
        {
            Print($"Error: {error.Code} - {error.TradeResult}");
            _lastError = $"Trading error: {error.Code}";
        }

        #endregion

        #region License Validation

        private async Task ValidateLicenseAsync()
        {
            try
            {
                var requestData = new
                {
                    licenseKey = LicenseKey,
                    accountId = Account.Number.ToString(),
                    broker = Account.BrokerName,
                    deviceId = DeviceId,
                    platform = "cTrader",
                    version = "1.0.0"
                };

                var json = JsonSerializer.Serialize(requestData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync(EndpointUrl, content);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var result = JsonSerializer.Deserialize<LicenseResponse>(responseBody);
                    
                    if (result != null && result.valid)
                    {
                        _isLicenseValid = true;
                        _cachedToken = result.token;
                        _tokenExpiry = DateTime.UtcNow.AddSeconds(result.ttlSeconds > 0 ? result.ttlSeconds : 900);
                        _lastLicenseCheck = DateTime.UtcNow;
                        _retryCount = 0;
                        _lastError = null;
                        _statusMessage = "Licensed - Active";
                        Print($"License validated. Token expires: {_tokenExpiry:u}");
                    }
                    else
                    {
                        HandleLicenseFailure(result?.message ?? "Invalid license response");
                    }
                }
                else
                {
                    HandleLicenseFailure($"HTTP {(int)response.StatusCode}: {responseBody}");
                }
            }
            catch (HttpRequestException ex)
            {
                HandleNetworkError(ex);
            }
            catch (TaskCanceledException)
            {
                HandleNetworkError(new Exception("Request timeout"));
            }
            catch (Exception ex)
            {
                HandleLicenseFailure($"Unexpected error: {ex.Message}");
            }
        }

        private void HandleLicenseFailure(string reason)
        {
            _isLicenseValid = false;
            _cachedToken = null;
            _lastError = reason;
            _statusMessage = $"License Invalid: {reason}";
            Print($"License validation failed: {reason}");
            UpdateStatusDisplay();
        }

        private void HandleNetworkError(Exception ex)
        {
            _retryCount++;
            _lastError = $"Network error: {ex.Message}";
            
            if (_retryCount >= MaxRetries)
            {
                _isLicenseValid = false;
                _cachedToken = null;
                _statusMessage = $"License check failed after {MaxRetries} retries";
                Print(_statusMessage);
            }
            else
            {
                // Exponential backoff
                var delay = BaseRetryDelayMs * (int)Math.Pow(2, _retryCount - 1);
                Print($"Network error, retry {_retryCount}/{MaxRetries} in {delay}ms: {ex.Message}");
                Thread.Sleep(delay);
                ValidateLicenseAsync().Wait();
            }
        }

        #endregion

        #region Data Emission

        private void EmitAccountData()
        {
            if (_pipeWriter == null || !_pipeServer.IsConnected)
            {
                // Try to reconnect pipe
                ReconnectPipe();
                return;
            }

            try
            {
                var accountData = new AccountSnapshot
                {
                    timestamp = DateTime.UtcNow.ToString("o"),
                    platform = "cTrader",
                    accountId = Account.Number.ToString(),
                    broker = Account.BrokerName,
                    balance = Account.Balance,
                    equity = Account.Equity,
                    margin = Account.Margin,
                    freeMargin = Account.FreeMargin,
                    marginLevel = Account.MarginLevel ?? 0,
                    floatingPnL = Account.UnrealizedNetProfit,
                    currency = Account.Asset.Name,
                    leverage = Account.PreciseLeverage,
                    status = _statusMessage,
                    isLicenseValid = _isLicenseValid,
                    isPaused = _isPaused,
                    lastError = _lastError,
                    positions = GetOpenPositions()
                };

                var json = JsonSerializer.Serialize(accountData);
                
                lock (_lockObject)
                {
                    _pipeWriter.WriteLine(json);
                    _pipeWriter.Flush();
                }
            }
            catch (Exception ex)
            {
                Print($"Error emitting data: {ex.Message}");
                ReconnectPipe();
            }
        }

        private List<PositionData> GetOpenPositions()
        {
            var positions = new List<PositionData>();

            foreach (var position in Positions)
            {
                positions.Add(new PositionData
                {
                    id = position.Id.ToString(),
                    symbol = position.SymbolName,
                    volume = position.VolumeInUnits,
                    volumeLots = position.Quantity,
                    side = position.TradeType == TradeType.Buy ? "BUY" : "SELL",
                    entryPrice = position.EntryPrice,
                    currentPrice = position.TradeType == TradeType.Buy ? 
                        Symbol.Bid : Symbol.Ask,
                    stopLoss = position.StopLoss,
                    takeProfit = position.TakeProfit,
                    profit = position.NetProfit,
                    pips = position.Pips,
                    swap = position.Swap,
                    commission = position.Commissions,
                    openTime = position.EntryTime.ToString("o"),
                    comment = position.Comment,
                    label = position.Label
                });
            }

            return positions;
        }

        #endregion

        #region Pipe Communication

        private void StartPipeServer()
        {
            try
            {
                _pipeServer = new NamedPipeServerStream(
                    StatusChannel,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous);

                Print($"Waiting for Hedge Edge app connection on pipe: {StatusChannel}");
                
                // Start async connection wait
                Task.Run(() =>
                {
                    try
                    {
                        _pipeServer.WaitForConnection();
                        _pipeWriter = new StreamWriter(_pipeServer) { AutoFlush = true };
                        Print("Hedge Edge app connected to data pipe.");
                    }
                    catch (Exception ex)
                    {
                        Print($"Pipe connection error: {ex.Message}");
                    }
                });
            }
            catch (Exception ex)
            {
                Print($"Error starting pipe server: {ex.Message}");
                _lastError = $"Pipe error: {ex.Message}";
            }
        }

        private void ReconnectPipe()
        {
            try
            {
                _pipeWriter?.Close();
                _pipeServer?.Close();
                _pipeServer?.Dispose();
            }
            catch { }

            StartPipeServer();
        }

        private void StartCommandListener()
        {
            _commandListenerThread = new Thread(CommandListenerLoop)
            {
                IsBackground = true,
                Name = "HedgeEdgeCommandListener"
            };
            _commandListenerThread.Start();
        }

        private void CommandListenerLoop()
        {
            var commandPipeName = $"{StatusChannel}_Commands";
            
            while (!_cancellationSource.Token.IsCancellationRequested)
            {
                try
                {
                    using (var commandPipe = new NamedPipeServerStream(
                        commandPipeName,
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous))
                    {
                        Print($"Command listener waiting on pipe: {commandPipeName}");
                        
                        // Wait with cancellation support
                        var connectTask = Task.Factory.FromAsync(
                            commandPipe.BeginWaitForConnection,
                            commandPipe.EndWaitForConnection,
                            null);
                        
                        connectTask.Wait(_cancellationSource.Token);

                        using (var reader = new StreamReader(commandPipe))
                        using (var writer = new StreamWriter(commandPipe) { AutoFlush = true })
                        {
                            while (commandPipe.IsConnected && !_cancellationSource.Token.IsCancellationRequested)
                            {
                                var commandLine = reader.ReadLine();
                                if (string.IsNullOrEmpty(commandLine))
                                {
                                    Thread.Sleep(100);
                                    continue;
                                }

                                var response = ProcessCommand(commandLine);
                                writer.WriteLine(response);
                            }
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Print($"Command listener error: {ex.Message}");
                    Thread.Sleep(1000);
                }
            }
        }

        private string ProcessCommand(string commandJson)
        {
            try
            {
                var command = JsonSerializer.Deserialize<CommandMessage>(commandJson);
                
                if (command == null)
                {
                    return JsonSerializer.Serialize(new { success = false, error = "Invalid command" });
                }

                Print($"Received command: {command.action}");

                switch (command.action?.ToUpperInvariant())
                {
                    case "PAUSE":
                        _isPaused = true;
                        _statusMessage = "Licensed - Paused";
                        UpdateStatusDisplay();
                        return JsonSerializer.Serialize(new { success = true, message = "Trading paused" });

                    case "RESUME":
                        if (_isLicenseValid)
                        {
                            _isPaused = false;
                            _statusMessage = "Licensed - Active";
                            UpdateStatusDisplay();
                            return JsonSerializer.Serialize(new { success = true, message = "Trading resumed" });
                        }
                        return JsonSerializer.Serialize(new { success = false, error = "Cannot resume: license invalid" });

                    case "CLOSE_ALL":
                        return CloseAllPositions();

                    case "CLOSE_POSITION":
                        if (!string.IsNullOrEmpty(command.positionId))
                        {
                            return ClosePosition(command.positionId);
                        }
                        return JsonSerializer.Serialize(new { success = false, error = "Position ID required" });

                    case "STATUS":
                        return JsonSerializer.Serialize(new
                        {
                            success = true,
                            isLicenseValid = _isLicenseValid,
                            isPaused = _isPaused,
                            status = _statusMessage,
                            lastError = _lastError,
                            tokenExpiry = _tokenExpiry.ToString("o"),
                            openPositions = Positions.Count
                        });

                    default:
                        return JsonSerializer.Serialize(new { success = false, error = $"Unknown command: {command.action}" });
                }
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { success = false, error = ex.Message });
            }
        }

        private string CloseAllPositions()
        {
            if (!_isLicenseValid)
            {
                return JsonSerializer.Serialize(new { success = false, error = "License invalid" });
            }

            int closedCount = 0;
            var errors = new List<string>();

            foreach (var position in Positions.ToList())
            {
                var result = ClosePosition(position);
                if (result.IsSuccessful)
                {
                    closedCount++;
                }
                else
                {
                    errors.Add($"{position.SymbolName}: {result.Error}");
                }
            }

            Print($"Close all: {closedCount} positions closed");
            
            return JsonSerializer.Serialize(new
            {
                success = errors.Count == 0,
                closedCount = closedCount,
                errors = errors
            });
        }

        private string ClosePosition(string positionId)
        {
            if (long.TryParse(positionId, out var id))
            {
                var position = Positions.Find(id);
                if (position != null)
                {
                    var result = ClosePosition(position);
                    return JsonSerializer.Serialize(new
                    {
                        success = result.IsSuccessful,
                        error = result.IsSuccessful ? null : result.Error.ToString()
                    });
                }
            }
            return JsonSerializer.Serialize(new { success = false, error = "Position not found" });
        }

        #endregion

        #region UI Updates

        private void UpdateStatusDisplay()
        {
            var color = _isLicenseValid ? (_isPaused ? Color.Orange : Color.Green) : Color.Red;
            Chart.DrawStaticText("HedgeEdgeStatus", 
                $"Hedge Edge: {_statusMessage}", 
                VerticalAlignment.Top, 
                HorizontalAlignment.Left, 
                color);
        }

        #endregion

        #region Helpers

        private string GenerateDeviceId()
        {
            // Generate a deterministic device ID based on machine characteristics
            var machineId = Environment.MachineName + Environment.UserName;
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(machineId));
                return BitConverter.ToString(hash).Replace("-", "").Substring(0, 32);
            }
        }

        #endregion

        #region Data Classes

        private class LicenseResponse
        {
            public bool valid { get; set; }
            public string token { get; set; }
            public int ttlSeconds { get; set; }
            public string message { get; set; }
            public string plan { get; set; }
            public string expiresAt { get; set; }
        }

        private class AccountSnapshot
        {
            public string timestamp { get; set; }
            public string platform { get; set; }
            public string accountId { get; set; }
            public string broker { get; set; }
            public double balance { get; set; }
            public double equity { get; set; }
            public double margin { get; set; }
            public double freeMargin { get; set; }
            public double marginLevel { get; set; }
            public double floatingPnL { get; set; }
            public string currency { get; set; }
            public double leverage { get; set; }
            public string status { get; set; }
            public bool isLicenseValid { get; set; }
            public bool isPaused { get; set; }
            public string lastError { get; set; }
            public List<PositionData> positions { get; set; }
        }

        private class PositionData
        {
            public string id { get; set; }
            public string symbol { get; set; }
            public double volume { get; set; }
            public double volumeLots { get; set; }
            public string side { get; set; }
            public double entryPrice { get; set; }
            public double currentPrice { get; set; }
            public double? stopLoss { get; set; }
            public double? takeProfit { get; set; }
            public double profit { get; set; }
            public double pips { get; set; }
            public double swap { get; set; }
            public double commission { get; set; }
            public string openTime { get; set; }
            public string comment { get; set; }
            public string label { get; set; }
        }

        private class CommandMessage
        {
            public string action { get; set; }
            public string positionId { get; set; }
            public string symbol { get; set; }
            public Dictionary<string, object> parameters { get; set; }
        }

        #endregion
    }
}
