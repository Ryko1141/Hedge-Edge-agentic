//+------------------------------------------------------------------+
//|                                                       Sodium.mqh |
//|                                   Copyright 2026, Hedge Edge     |
//|                                     https://www.hedge-edge.com   |
//+------------------------------------------------------------------+
//| libsodium Wrapper for MQL5                                       |
//| Provides cryptographic operations for secure license validation  |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Hedge Edge"
#property link      "https://www.hedge-edge.com"
#property version   "1.00"
#property strict

//+------------------------------------------------------------------+
//| Sodium Constants                                                  |
//+------------------------------------------------------------------+

// crypto_secretbox_xsalsa20poly1305
#define crypto_secretbox_KEYBYTES     32
#define crypto_secretbox_NONCEBYTES   24
#define crypto_secretbox_MACBYTES     16
#define crypto_secretbox_ZEROBYTES    32
#define crypto_secretbox_BOXZEROBYTES 16

// crypto_generichash (BLAKE2b)
#define crypto_generichash_BYTES         32
#define crypto_generichash_BYTES_MIN     16
#define crypto_generichash_BYTES_MAX     64
#define crypto_generichash_KEYBYTES      32
#define crypto_generichash_KEYBYTES_MIN  16
#define crypto_generichash_KEYBYTES_MAX  64

// crypto_pwhash (Argon2)
#define crypto_pwhash_SALTBYTES          16
#define crypto_pwhash_STRBYTES           128
#define crypto_pwhash_OPSLIMIT_MIN       1
#define crypto_pwhash_OPSLIMIT_INTERACTIVE 2
#define crypto_pwhash_OPSLIMIT_MODERATE  3
#define crypto_pwhash_OPSLIMIT_SENSITIVE 4
#define crypto_pwhash_MEMLIMIT_MIN       8192
#define crypto_pwhash_MEMLIMIT_INTERACTIVE 67108864
#define crypto_pwhash_MEMLIMIT_MODERATE  268435456
#define crypto_pwhash_MEMLIMIT_SENSITIVE 1073741824
#define crypto_pwhash_ALG_DEFAULT        2
#define crypto_pwhash_ALG_ARGON2I13      1
#define crypto_pwhash_ALG_ARGON2ID13     2

//+------------------------------------------------------------------+
//| libsodium DLL Imports                                             |
//| Library: libsodium.dll (must be in MQL5/Libraries/)              |
//+------------------------------------------------------------------+
#import "libsodium.dll"

// Initialization
int sodium_init();

// Version
string sodium_version_string();
int sodium_library_version_major();
int sodium_library_version_minor();

// Random bytes
void randombytes_buf(uchar &buf[], int size);
uint randombytes_random();
uint randombytes_uniform(uint upper_bound);

// Generic hashing (BLAKE2b)
int crypto_generichash(
   uchar &out[], 
   int outlen,
   const uchar &in[], 
   long long inlen,
   const uchar &key[], 
   int keylen
);

// Keyed hashing
int crypto_generichash_init(
   uchar &state[],
   const uchar &key[],
   int keylen,
   int outlen
);
int crypto_generichash_update(
   uchar &state[],
   const uchar &in[],
   long long inlen
);
int crypto_generichash_final(
   uchar &state[],
   uchar &out[],
   int outlen
);

// Secret-key authenticated encryption (XSalsa20-Poly1305)
int crypto_secretbox_easy(
   uchar &c[],          // ciphertext output (message + MACBYTES)
   const uchar &m[],    // message input
   long long mlen,      // message length
   const uchar &n[],    // nonce (NONCEBYTES)
   const uchar &k[]     // key (KEYBYTES)
);

int crypto_secretbox_open_easy(
   uchar &m[],          // message output
   const uchar &c[],    // ciphertext input
   long long clen,      // ciphertext length
   const uchar &n[],    // nonce (NONCEBYTES)
   const uchar &k[]     // key (KEYBYTES)
);

// Password hashing (Argon2)
int crypto_pwhash(
   uchar &out[],
   long long outlen,
   const char &passwd[],
   long long passwdlen,
   const uchar &salt[],
   long long opslimit,
   int memlimit,
   int alg
);

// Helpers
void sodium_memzero(uchar &pnt[], int len);
int sodium_memcmp(const uchar &b1[], const uchar &b2[], int len);

// Base64 encoding
int sodium_base64_encoded_len(int bin_len, int variant);
int sodium_bin2base64(
   char &b64[],
   int b64_maxlen,
   const uchar &bin[],
   int bin_len,
   int variant
);
int sodium_base642bin(
   uchar &bin[],
   int bin_maxlen,
   const char &b64[],
   int b64_len,
   const char &ignore[],
   int &bin_len,
   char &b64_end[],
   int variant
);

// Hex encoding
int sodium_bin2hex(
   char &hex[],
   int hex_maxlen,
   const uchar &bin[],
   int bin_len
);
int sodium_hex2bin(
   uchar &bin[],
   int bin_maxlen,
   const char &hex[],
   int hex_len,
   const char &ignore[],
   int &bin_len,
   char &hex_end[]
);

#import

//+------------------------------------------------------------------+
//| Base64 Variants for sodium_bin2base64                             |
//+------------------------------------------------------------------+
#define sodium_base64_VARIANT_ORIGINAL            1
#define sodium_base64_VARIANT_ORIGINAL_NO_PADDING 3
#define sodium_base64_VARIANT_URLSAFE             5
#define sodium_base64_VARIANT_URLSAFE_NO_PADDING  7

//+------------------------------------------------------------------+
//| Sodium Helper Class - High-level crypto operations                |
//+------------------------------------------------------------------+
class CSodium
{
private:
   bool m_initialized;
   uchar m_key[crypto_secretbox_KEYBYTES];
   bool m_hasKey;
   
public:
   CSodium() : m_initialized(false), m_hasKey(false) 
   {
      ArrayInitialize(m_key, 0);
   }
   
   ~CSodium()
   {
      // Securely zero the key
      if(m_hasKey)
      {
         sodium_memzero(m_key, crypto_secretbox_KEYBYTES);
         m_hasKey = false;
      }
   }
   
   //--- Initialize libsodium
   bool Initialize()
   {
      if(m_initialized)
         return true;
      
      int result = sodium_init();
      
      // Returns 0 on success, 1 if already initialized, -1 on failure
      if(result < 0)
      {
         Print("Sodium: Failed to initialize libsodium");
         return false;
      }
      
      m_initialized = true;
      Print("Sodium: Initialized successfully, version: ", sodium_version_string());
      return true;
   }
   
   bool IsInitialized() const { return m_initialized; }
   
   //--- Set encryption key from string (derives key using hash)
   bool SetKeyFromString(string keyString)
   {
      if(!m_initialized) return false;
      
      uchar input[];
      int len = StringToCharArray(keyString, input, 0, WHOLE_ARRAY, CP_UTF8) - 1;
      
      // Hash the string to derive a proper 32-byte key
      int result = crypto_generichash(m_key, crypto_secretbox_KEYBYTES, input, len, input, 0);
      
      if(result != 0)
      {
         Print("Sodium: Failed to derive key");
         return false;
      }
      
      m_hasKey = true;
      return true;
   }
   
   //--- Set encryption key directly (must be KEYBYTES length)
   bool SetKey(const uchar &key[])
   {
      if(!m_initialized) return false;
      if(ArraySize(key) != crypto_secretbox_KEYBYTES)
      {
         Print("Sodium: Invalid key size, expected ", crypto_secretbox_KEYBYTES, " bytes");
         return false;
      }
      
      ArrayCopy(m_key, key, 0, 0, crypto_secretbox_KEYBYTES);
      m_hasKey = true;
      return true;
   }
   
   //--- Generate random nonce
   void GenerateNonce(uchar &nonce[])
   {
      ArrayResize(nonce, crypto_secretbox_NONCEBYTES);
      randombytes_buf(nonce, crypto_secretbox_NONCEBYTES);
   }
   
   //--- Encrypt data
   bool Encrypt(const uchar &plaintext[], uchar &ciphertext[], uchar &nonce[])
   {
      if(!m_initialized || !m_hasKey) return false;
      
      int plaintextLen = ArraySize(plaintext);
      int ciphertextLen = plaintextLen + crypto_secretbox_MACBYTES;
      
      // Generate nonce
      GenerateNonce(nonce);
      
      // Resize ciphertext buffer
      ArrayResize(ciphertext, ciphertextLen);
      
      int result = crypto_secretbox_easy(ciphertext, plaintext, plaintextLen, nonce, m_key);
      
      return result == 0;
   }
   
   //--- Encrypt string to base64
   bool EncryptString(string plaintext, string &ciphertext, string &nonceHex)
   {
      if(!m_initialized || !m_hasKey) return false;
      
      // Convert string to bytes
      uchar plaintextBytes[];
      int len = StringToCharArray(plaintext, plaintextBytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
      ArrayResize(plaintextBytes, len);
      
      uchar ciphertextBytes[];
      uchar nonce[];
      
      if(!Encrypt(plaintextBytes, ciphertextBytes, nonce))
         return false;
      
      // Convert to hex strings for transport
      char hexBuffer[];
      int cipherLen = ArraySize(ciphertextBytes);
      ArrayResize(hexBuffer, cipherLen * 2 + 1);
      sodium_bin2hex(hexBuffer, cipherLen * 2 + 1, ciphertextBytes, cipherLen);
      ciphertext = CharArrayToString(hexBuffer);
      
      ArrayResize(hexBuffer, crypto_secretbox_NONCEBYTES * 2 + 1);
      sodium_bin2hex(hexBuffer, crypto_secretbox_NONCEBYTES * 2 + 1, nonce, crypto_secretbox_NONCEBYTES);
      nonceHex = CharArrayToString(hexBuffer);
      
      return true;
   }
   
   //--- Decrypt data
   bool Decrypt(const uchar &ciphertext[], const uchar &nonce[], uchar &plaintext[])
   {
      if(!m_initialized || !m_hasKey) return false;
      
      int ciphertextLen = ArraySize(ciphertext);
      if(ciphertextLen < crypto_secretbox_MACBYTES)
         return false;
      
      int plaintextLen = ciphertextLen - crypto_secretbox_MACBYTES;
      ArrayResize(plaintext, plaintextLen);
      
      int result = crypto_secretbox_open_easy(plaintext, ciphertext, ciphertextLen, nonce, m_key);
      
      return result == 0;
   }
   
   //--- Decrypt from hex strings
   bool DecryptString(string ciphertextHex, string nonceHex, string &plaintext)
   {
      if(!m_initialized || !m_hasKey) return false;
      
      // Convert hex to bytes
      uchar cipherBytes[];
      int cipherMaxLen = StringLen(ciphertextHex) / 2;
      ArrayResize(cipherBytes, cipherMaxLen);
      
      char cipherHexArr[];
      StringToCharArray(ciphertextHex, cipherHexArr);
      char ignoreArr[];
      ArrayResize(ignoreArr, 1);
      ignoreArr[0] = 0;
      int actualCipherLen = 0;
      char endArr[];
      ArrayResize(endArr, 1);
      
      sodium_hex2bin(cipherBytes, cipherMaxLen, cipherHexArr, StringLen(ciphertextHex), 
                     ignoreArr, actualCipherLen, endArr);
      ArrayResize(cipherBytes, actualCipherLen);
      
      // Convert nonce hex
      uchar nonceBytes[];
      ArrayResize(nonceBytes, crypto_secretbox_NONCEBYTES);
      char nonceHexArr[];
      StringToCharArray(nonceHex, nonceHexArr);
      int actualNonceLen = 0;
      
      sodium_hex2bin(nonceBytes, crypto_secretbox_NONCEBYTES, nonceHexArr, StringLen(nonceHex),
                     ignoreArr, actualNonceLen, endArr);
      
      // Decrypt
      uchar plaintextBytes[];
      if(!Decrypt(cipherBytes, nonceBytes, plaintextBytes))
         return false;
      
      plaintext = CharArrayToString(plaintextBytes, 0, WHOLE_ARRAY, CP_UTF8);
      return true;
   }
   
   //--- Hash data (BLAKE2b)
   bool Hash(const uchar &input[], uchar &output[], int outputLen = crypto_generichash_BYTES)
   {
      if(!m_initialized) return false;
      
      ArrayResize(output, outputLen);
      uchar emptyKey[];
      
      int result = crypto_generichash(output, outputLen, input, ArraySize(input), emptyKey, 0);
      
      return result == 0;
   }
   
   //--- Hash string to hex
   string HashString(string input)
   {
      if(!m_initialized) return "";
      
      uchar inputBytes[];
      int len = StringToCharArray(input, inputBytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
      ArrayResize(inputBytes, len);
      
      uchar hashBytes[];
      if(!Hash(inputBytes, hashBytes))
         return "";
      
      char hexBuffer[];
      ArrayResize(hexBuffer, crypto_generichash_BYTES * 2 + 1);
      sodium_bin2hex(hexBuffer, crypto_generichash_BYTES * 2 + 1, hashBytes, crypto_generichash_BYTES);
      
      return CharArrayToString(hexBuffer);
   }
   
   //--- Generate random hex string
   string RandomHex(int byteCount)
   {
      if(!m_initialized) return "";
      
      uchar randomBytes[];
      ArrayResize(randomBytes, byteCount);
      randombytes_buf(randomBytes, byteCount);
      
      char hexBuffer[];
      ArrayResize(hexBuffer, byteCount * 2 + 1);
      sodium_bin2hex(hexBuffer, byteCount * 2 + 1, randomBytes, byteCount);
      
      return CharArrayToString(hexBuffer);
   }
};

//+------------------------------------------------------------------+
//| Get Sodium Version String                                         |
//+------------------------------------------------------------------+
string SodiumVersion()
{
   return sodium_version_string();
}

#endif // SODIUM_MQH
