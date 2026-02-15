"""
MT5 API Server
Flask REST API that connects to MetaTrader 5 and exposes account data.

Endpoints:
- GET /api/mt5/snapshot - Returns current account state, positions, and market ticks

Requirements:
- MetaTrader 5 terminal must be running
- Valid MT5 credentials in environment variables
"""

from flask import Flask, jsonify, request as flask_request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import MetaTrader5 as mt5
import os
import secrets
import functools
import re
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env.mt5
load_dotenv('.env.mt5')

# ── Audit logging for trades ────────────────────────────────────────────────
logging.basicConfig(
    filename='mt5_trades.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)

app = Flask(__name__)
CORS(app, origins=['http://127.0.0.1:3000', 'http://localhost:3000'])

# ── Rate limiting ───────────────────────────────────────────────────────────
limiter = Limiter(app=app, key_func=get_remote_address, default_limits=["60 per minute"])

# ── Bearer token authentication ─────────────────────────────────────────────
API_TOKEN = secrets.token_urlsafe(32)

def require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = flask_request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer ') or auth_header[7:] != API_TOKEN:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

# ── Input validation helpers ────────────────────────────────────────────────
SYMBOL_PATTERN = re.compile(r'^[A-Za-z0-9._]{1,20}$')
MAX_VOLUME = float(os.getenv('MT5_MAX_VOLUME', '10.0'))


def initialize_mt5():
    """Initialize MT5 connection with credentials from environment"""
    # Get credentials from environment variables
    login = os.getenv('MT5_LOGIN')
    password = os.getenv('MT5_PASSWORD')
    server = os.getenv('MT5_SERVER')
    terminal_path = os.getenv('MT5_TERMINAL_PATH')
    
    if not login or not password or not server:
        print("Error: Missing MT5 credentials in environment variables")
        return False
    
    login = int(login)
    
    # Initialize MT5 terminal
    if terminal_path and os.path.exists(terminal_path):
        if not mt5.initialize(path=terminal_path):
            print(f"initialize() failed, error code = {mt5.last_error()}")
            return False
    else:
        if not mt5.initialize():
            print(f"initialize() failed, error code = {mt5.last_error()}")
            return False
    
    # Login to trading account
    authorized = mt5.login(login=login, password=password, server=server)
    if not authorized:
        print(f"login failed, error code = {mt5.last_error()}")
        mt5.shutdown()
        return False
    
    print(f"Connected to MT5 account {login} on {server}")
    return True


@app.route('/api/mt5/snapshot', methods=['GET'])
@require_auth
def get_mt5_snapshot():
    """Endpoint that returns current MT5 account state as JSON"""
    
    # Initialize MT5 connection
    if not initialize_mt5():
        return jsonify({'error': 'Failed to connect to MT5'}), 500
    
    try:
        # Get account information
        account_info = mt5.account_info()
        if account_info is None:
            return jsonify({'error': 'Failed to get account info'}), 500
        
        # Get open positions
        positions = mt5.positions_get()
        positions_list = []
        if positions:
            for pos in positions:
                positions_list.append({
                    'ticket': pos.ticket,
                    'symbol': pos.symbol,
                    'type': 'BUY' if pos.type == 0 else 'SELL',
                    'volume': pos.volume,
                    'price_open': pos.price_open,
                    'price_current': pos.price_current,
                    'profit': pos.profit,
                    'swap': getattr(pos, 'swap', 0),
                    'sl': pos.sl,
                    'tp': pos.tp,
                    'time': datetime.fromtimestamp(pos.time).isoformat(),
                    'magic': pos.magic,
                    'comment': getattr(pos, 'comment', '')
                })
        
        # Get pending orders
        orders = mt5.orders_get()
        orders_list = []
        if orders:
            for order in orders:
                order_types = {
                    0: 'BUY', 1: 'SELL', 2: 'BUY_LIMIT', 3: 'SELL_LIMIT',
                    4: 'BUY_STOP', 5: 'SELL_STOP', 6: 'BUY_STOP_LIMIT', 7: 'SELL_STOP_LIMIT'
                }
                orders_list.append({
                    'ticket': order.ticket,
                    'symbol': order.symbol,
                    'type': order_types.get(order.type, 'UNKNOWN'),
                    'volume': order.volume_current,
                    'price_open': order.price_open,
                    'sl': order.sl,
                    'tp': order.tp,
                    'time': datetime.fromtimestamp(order.time_setup).isoformat(),
                    'magic': order.magic,
                    'comment': order.comment
                })
        
        # Get market ticks for monitored symbols
        tickers = os.getenv('MT5_TICKERS', 'EURUSD').split(',')
        ticks = {}
        for symbol in tickers:
            symbol = symbol.strip()
            tick = mt5.symbol_info_tick(symbol)
            if tick:
                ticks[symbol] = {
                    'bid': tick.bid,
                    'ask': tick.ask,
                    'last': tick.last,
                    'volume': tick.volume,
                    'time': datetime.fromtimestamp(tick.time).isoformat()
                }
            else:
                # Try to enable the symbol first
                mt5.symbol_select(symbol, True)
                tick = mt5.symbol_info_tick(symbol)
                if tick:
                    ticks[symbol] = {
                        'bid': tick.bid,
                        'ask': tick.ask,
                        'last': tick.last,
                        'volume': tick.volume,
                        'time': datetime.fromtimestamp(tick.time).isoformat()
                    }
        
        # Build response
        snapshot = {
            'balance': account_info.balance,
            'equity': account_info.equity,
            'margin': account_info.margin,
            'margin_free': account_info.margin_free,
            'margin_level': account_info.margin_level if account_info.margin > 0 else None,
            'profit': account_info.profit,
            'leverage': account_info.leverage,
            'currency': account_info.currency,
            'server': account_info.server,
            'login': account_info.login,
            'positions': positions_list,
            'orders': orders_list,
            'ticks': ticks,
            'positions_count': len(positions_list),
            'orders_count': len(orders_list),
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(snapshot), 200
        
    except Exception as e:
        print(f"[MT5 API Error] {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
    
    finally:
        # Clean up MT5 connection
        mt5.shutdown()


@app.route('/api/mt5/health', methods=['GET'])
@require_auth
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'MT5 API Server',
        'timestamp': datetime.now().isoformat()
    }), 200


@app.route('/api/mt5/symbols', methods=['GET'])
@require_auth
def get_symbols():
    """Get list of available symbols"""
    if not initialize_mt5():
        return jsonify({'error': 'Failed to connect to MT5'}), 500
    
    try:
        symbols = mt5.symbols_get()
        if symbols:
            symbol_list = [{'name': s.name, 'description': s.description} for s in symbols[:100]]  # Limit to 100
            return jsonify({'symbols': symbol_list, 'total': len(symbols)}), 200
        return jsonify({'symbols': [], 'total': 0}), 200
    finally:
        mt5.shutdown()


@app.route('/api/mt5/order', methods=['POST'])
@limiter.limit("10 per minute")
@require_auth
def place_order():
    """Place a new market order (Trade Copier fallback)
    
    JSON body: { symbol, side (BUY/SELL), volume, sl?, tp?, magic?, comment?, deviation? }
    """
    if not initialize_mt5():
        return jsonify({'success': False, 'error': 'Failed to connect to MT5'}), 500
    
    try:
        data = flask_request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'JSON body required'}), 400
        
        symbol = data.get('symbol', '')
        side = data.get('side', '').upper()
        volume = float(data.get('volume', 0))
        sl = float(data.get('sl', 0))
        tp = float(data.get('tp', 0))
        magic = int(data.get('magic', 123456))
        comment = data.get('comment', 'HedgeEdge Copy')
        deviation = int(data.get('deviation', 10))
        
        # Input validation
        if not symbol or not SYMBOL_PATTERN.match(symbol):
            return jsonify({'success': False, 'error': 'Invalid symbol format'}), 400
        if side not in ('BUY', 'SELL'):
            return jsonify({'success': False, 'error': 'Side must be BUY or SELL'}), 400
        if volume <= 0 or volume > MAX_VOLUME:
            return jsonify({'success': False, 'error': f'Volume must be between 0 and {MAX_VOLUME}'}), 400
        if len(comment) > 31:
            comment = comment[:31]
        
        # Get symbol info for price
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            return jsonify({'success': False, 'error': f'Symbol not found: {symbol}'}), 400
        
        if not symbol_info.visible:
            mt5.symbol_select(symbol, True)
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return jsonify({'success': False, 'error': f'Cannot get tick for {symbol}'}), 400
        
        price = tick.ask if side == 'BUY' else tick.bid
        order_type = mt5.ORDER_TYPE_BUY if side == 'BUY' else mt5.ORDER_TYPE_SELL
        
        # Normalize volume
        lot_step = symbol_info.volume_step
        lot_min = symbol_info.volume_min
        lot_max = symbol_info.volume_max
        if lot_step > 0:
            volume = int(volume / lot_step) * lot_step
        volume = max(lot_min, min(lot_max, volume))
        
        request_params = {
            'action': mt5.TRADE_ACTION_DEAL,
            'symbol': symbol,
            'volume': volume,
            'type': order_type,
            'price': price,
            'sl': sl if sl > 0 else 0.0,
            'tp': tp if tp > 0 else 0.0,
            'deviation': deviation,
            'magic': magic,
            'comment': comment,
            'type_time': mt5.ORDER_TIME_GTC,
            'type_filling': mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request_params)
        
        if result is None:
            return jsonify({'success': False, 'error': 'order_send returned None', 'last_error': str(mt5.last_error())}), 500
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return jsonify({
                'success': False,
                'error': f'Order rejected: retcode={result.retcode}, comment={result.comment}',
                'retcode': result.retcode,
            }), 400
        
        # Audit log successful trade
        logging.info(f"TRADE EXECUTED | symbol={symbol} | type={side} | volume={volume} | ticket={result.order}")
        
        return jsonify({
            'success': True,
            'action': 'OPEN_POSITION',
            'ticket': result.deal,
            'order': result.order,
            'symbol': symbol,
            'side': side,
            'volume': volume,
            'price': result.price,
            'retcode': result.retcode,
            'timestamp': datetime.now().isoformat(),
        }), 200
    
    except Exception as e:
        print(f"[MT5 API Error] {str(e)}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500
    finally:
        mt5.shutdown()


@app.route('/api/mt5/order/<int:ticket>', methods=['PUT'])
@limiter.limit("10 per minute")
@require_auth
def modify_order(ticket):
    """Modify position SL/TP (Trade Copier fallback)
    
    JSON body: { sl?, tp? }
    """
    if not initialize_mt5():
        return jsonify({'success': False, 'error': 'Failed to connect to MT5'}), 500
    
    try:
        data = flask_request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'JSON body required'}), 400
        
        # Find the position
        position = None
        positions = mt5.positions_get()
        if positions:
            for pos in positions:
                if pos.ticket == ticket:
                    position = pos
                    break
        
        if position is None:
            return jsonify({'success': False, 'error': f'Position not found: {ticket}'}), 404
        
        new_sl = float(data.get('sl', position.sl))
        new_tp = float(data.get('tp', position.tp))
        
        request_params = {
            'action': mt5.TRADE_ACTION_SLTP,
            'position': ticket,
            'symbol': position.symbol,
            'sl': new_sl,
            'tp': new_tp,
        }
        
        result = mt5.order_send(request_params)
        
        if result is None:
            return jsonify({'success': False, 'error': 'order_send returned None'}), 500
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return jsonify({
                'success': False,
                'error': f'Modify rejected: retcode={result.retcode}, comment={result.comment}',
                'retcode': result.retcode,
            }), 400
        
        # Audit log modification
        logging.info(f"TRADE MODIFIED | ticket={ticket} | sl={new_sl} | tp={new_tp}")
        
        return jsonify({
            'success': True,
            'action': 'MODIFY_POSITION',
            'ticket': ticket,
            'sl': new_sl,
            'tp': new_tp,
            'retcode': result.retcode,
            'timestamp': datetime.now().isoformat(),
        }), 200
    
    except Exception as e:
        print(f"[MT5 API Error] {str(e)}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500
    finally:
        mt5.shutdown()


if __name__ == '__main__':
    login = os.getenv('MT5_LOGIN', '')
    print("=" * 50)
    print("MT5 API Server Starting...")
    print("=" * 50)
    print(f"MT5 Login: {'*' * max(0, len(login)-4)}{login[-4:]}" if login else "MT5 Login: not set")
    print(f"MT5 Server: {os.getenv('MT5_SERVER')}")
    print(f"Monitoring Tickers: {os.getenv('MT5_TICKERS')}")
    print("=" * 50)
    print("Endpoints:")
    print("  - http://127.0.0.1:5000/api/mt5/snapshot")
    print("  - http://127.0.0.1:5000/api/mt5/health")
    print("  - http://127.0.0.1:5000/api/mt5/symbols")
    print("  - http://127.0.0.1:5000/api/mt5/order  [POST] - Place order")
    print("  - http://127.0.0.1:5000/api/mt5/order/<ticket>  [PUT] - Modify SL/TP")
    print("=" * 50)
    print(f"MT5_API_TOKEN={API_TOKEN}", flush=True)
    app.run(host='127.0.0.1', port=5000, debug=False)
