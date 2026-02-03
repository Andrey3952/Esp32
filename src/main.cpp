#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const int pin_SCLK = 18;
const int pin_MISO = 4;
const int pin_MOSI = 23;
const int pin_SS = 5;
char customSSID[32] = "";
char customPass[32] = "";
const char *ssidAR = "ESP32_AP";
const char *passwordAR = "12345678";

const String gh_base = "https://raw.githubusercontent.com/Andrey3952/Esp32/main/src/";
const String file_html = "index.html";
const String file_css = "style.css";
const String file_js = "script.js";
const String chart_js = "chart.js";

bool shouldUpdate = false;
bool shouldCon = false;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

const char fallback_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <title>ESP Offline</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 50px; }
    h1 { color: #e74c3c; }
  </style>
</head>
<body>
  <h1>Увага: Немає зв'язку з GitHub</h1>
  <p>Не вдалося завантажити оновлення.</p>
  <input type="text" id="ssid" placeholder="ssid">
  <input type="text" id="pass" placeholder="pass">
  <button onclick="sendWifi()">🔄 Перезавантажити ESP32</button>
  <div id="status">Очікування...</div>
  <script>
    const ws = new WebSocket("ws://192.168.4.1/ws");
    ws.onmessage = function(event) {
        document.getElementById("status").innerText = event.data;
    };
    function sendWifi() {
      const ssid = document.getElementById("ssid").value;
      const pass = document.getElementById("pass").value;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ line1: ssid, line2: pass }));
      }
    }
  </script>
</body>
</html>
)rawliteral";

bool downloadFile(String filename)
{
  String url = gh_base + filename;
  Serial.println("Downloading: " + url);
  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  if (http.begin(client, url))
  {
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK)
    {
      File file = LittleFS.open("/" + filename, "w");
      if (file)
      {
        http.writeToStream(&file);
        file.close();
        Serial.println("File saved: " + filename);
        http.end();
        return true;
      }
    }
    http.end();
  }
  return false;
}

void startUpdateProcess()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(customSSID, customPass);
  ws.textAll("Підключення до " + String(customSSID) + "...");
  int i = 0;
  while (WiFi.status() != WL_CONNECTED && i < 20)
  {
    delay(500);
    i++;
  }
  if (WiFi.status() == WL_CONNECTED)
  {
    ws.textAll("WiFi OK! Качаємо файли...");
    bool ok1 = downloadFile(file_html);
    bool ok2 = downloadFile(file_css);
    bool ok3 = downloadFile(file_js);
    bool ok4 = downloadFile(chart_js);
    if (ok1 && ok2 && ok3 && ok4)
    {
      ws.textAll("Успіх! Перезавантаження...");
      delay(2000);
      ESP.restart();
    }
    else
    {
      ws.textAll("Помилка скачування!");
    }
  }
  else
  {
    ws.textAll("Не вдалося підключитись до WiFi!");
  }
}

void startCon()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(customSSID, customPass);
  ws.textAll("Підключення до " + String(customSSID) + "...");
  int i = 0;
  while (WiFi.status() != WL_CONNECTED && i < 30)
  {
    delay(500);
    i++;
  }
  if (WiFi.status() == WL_CONNECTED)
  {
    for (int k = 0; k < 5; k++)
    {
      delay(1000);
    }
    ws.textAll("WiFi OK!");
    delay(500);
    ws.textAll("WiFi OK!");
  }
  else
  {
    ws.textAll("Не вдалося підключитись до WiFi!");
  }
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len)
{
  switch (type)
  {
  case WS_EVT_CONNECT:
    Serial.printf("WebSocket client #%u connected\n", client->id());
    break;
  case WS_EVT_DISCONNECT:
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    break;

  case WS_EVT_DATA:
  { // <--- ВАЖЛИВО: Дужка відкривається тут для виправлення помилки компіляції
    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT)
    {
      data[len] = 0;
      String message = (char *)data;
      if (message == "RESET")
      {
        ESP.restart();
      }
      else
      {
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, message);
        if (!error)
        {
          const char *l1 = doc["line1"];
          const char *l2 = doc["line2"];
          const char *conSSID = doc["conSSID"];
          const char *conPASS = doc["conPASS"];
          if (l1 && l2)
          {
            strlcpy(customSSID, l1, sizeof(customSSID));
            strlcpy(customPass, l2, sizeof(customPass));
            shouldUpdate = true;
          }
          if (conSSID && conPASS)
          {
            strlcpy(customSSID, conSSID, sizeof(customSSID));
            strlcpy(customPass, conPASS, sizeof(customPass));
            shouldCon = true;
          }
        }
      }
    }
    break;
  } // <--- Дужка закривається тут
  }
}

void setup()
{
  Serial.begin(115200);
  if (!LittleFS.begin(true))
  {
    Serial.println("Mount Failed");
    return;
  }

  pinMode(pin_SS, OUTPUT);
  digitalWrite(pin_SS, HIGH);
  SPI.begin(pin_SCLK, pin_MISO, pin_MOSI, pin_SS);
  // Налаштовуємо SPI глобально тут
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));

  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssidAR, passwordAR);
  WiFi.setSleep(false);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  bool filesExist = LittleFS.exists("/index.html") && LittleFS.exists("/style.css") && LittleFS.exists("/script.js");

  ws.onEvent(onEvent);
  server.addHandler(&ws);

  if (filesExist)
  {
    Serial.println("Starting Normal Mode");
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  }
  else
  {
    Serial.println("Starting Update Mode");
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(200, "text/html", fallback_html); });
  }
  server.begin();
}
// --- НАЛАШТУВАННЯ ---
#define SAMPLING_DELAY_MICROS 40 // 60 Гц (частота збору даних)
#define SAMPLES_PER_PACKET 1024  // Розмір пачки (буфер)

// Глобальні змінні
uint16_t packetBuffer[SAMPLES_PER_PACKET];
int packetIndex = 0;
unsigned long previousMicros = 0;

void loop()
{
  ws.cleanupClients(); // WiFi працює стабільно

  if (shouldUpdate)
  {
    startUpdateProcess();
    shouldUpdate = false;
  }
  if (shouldCon)
  {
    startCon();
    shouldCon = false;
  }

  // Працюємо, тільки якщо є клієнт
  if (!shouldCon && !shouldUpdate && ws.count() > 0)
  {
    unsigned long currentMicros = micros();

    if (currentMicros - previousMicros >= SAMPLING_DELAY_MICROS)
    { // Замість поциклового читання в loop, робимо це одним блоком:
      if (currentMicros - previousMicros >= (SAMPLING_DELAY_MICROS * SAMPLES_PER_PACKET))
      {
        previousMicros = currentMicros;

        digitalWrite(pin_SS, LOW);

        // NULL в першому аргументі означає, що ми нічого не відправляємо (MOSI ігнорується)
        // Дані з MISO запишуться прямо в packetBuffer
        SPI.transferBytes(NULL, (uint8_t *)packetBuffer, SAMPLES_PER_PACKET * 2);

        digitalWrite(pin_SS, HIGH);

        // Оскільки ESP32 — Little Endian, а SPI зазвичай Big Endian,
        // можливо знадобиться поміняти байти місцями (Endianness swap),
        // якщо графік буде виглядати як "шум".

        if (ws.availableForWriteAll())
        {
          for (int i = 0; i < SAMPLES_PER_PACKET; i++)
          {
            uint16_t raw = packetBuffer[i];

            // 1. Обов'язково міняємо байти місцями
            uint16_t swapped = (raw >> 8) | (raw << 8);

            // 2. Маскуємо 12 біт.
            // ЯКЩО ПІСЛЯ ЦЬОГО ЧИСЛА ВСЕ ОДНО ДИВНІ - спробуйте (swapped >> 4)
            packetBuffer[i] = swapped & 0x0FFF;
          }
          ws.binaryAll((uint8_t *)packetBuffer, SAMPLES_PER_PACKET * 2);
        }
      }
    }
  }
}
