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
// https://raw.githubusercontent.com/Andrey3952/Esp32/main/src/

const String gh_base = "https://raw.githubusercontent.com/Andrey3952/Esp32/main/src/";
const String file_html = "index.html";
const String file_css = "style.css";
const String file_js = "script.js";
const String chart_js = "chart.js";

bool shouldUpdate = false;
bool shouldCon = false;

// Створюємо об'єкт сервера на порту 80
AsyncWebServer server(80);
// Створюємо об'єкт WebSocket на шляху /ws
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
  <p>Це резервна сторінка з пам'яті ESP32.</p>
  <p>Привіт з ESP32!</p>

    <input type="text" id="ssid" placeholder="ssid">
    <input type="text" id="pass" placeholder="pass">

  <button onclick="sendWifi()">🔄 Перезавантажити ESP32</button>

  <div id="status">Очікування...</div>

 
  <script>
const ws = new WebSocket("ws://192.168.4.1/ws");

ws.onmessage = function(event) {
       // Цей код оновлює текст на екрані, коли ESP надсилає статус
       document.getElementById("status").innerText = event.data;
    };

function sendWifi() {
  const ssid = document.getElementById("ssid").value;
  const pass = document.getElementById("pass").value;

  if (!ssid) {
    alert("SSID не може бути порожнім");
    return;
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      line1: ssid,
      line2: pass
    }));
  } else {
    alert("WebSocket не підключений");
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
  client.setInsecure(); // Ігноруємо SSL сертифікати (найпростіший спосіб для GitHub)

  if (http.begin(client, url))
  {
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK)
    {
      // Відкриваємо файл для запису
      File file = LittleFS.open("/" + filename, "w");
      if (file)
      {
        // Записуємо потік даних з інтернету прямо в файл
        http.writeToStream(&file);
        file.close();
        Serial.println("File saved: " + filename);
        http.end();
        return true;
      }
    }
    else
    {
      Serial.printf("HTTP Error: %d\n", httpCode);
    }
    http.end();
  }
  Serial.println("Download failed!");
  return false;
}

void startUpdateProcess()
{
  // Перемикаємо в режим AP+STA, щоб не розірвати зв'язок з телефоном/компом
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
  // Перемикаємо в режим AP+STA, щоб не розірвати зв'язок з телефоном/компом
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
    ws.textAll("WiFi OK!");
  }
  else
  {
    ws.textAll("Не вдалося підключитись до WiFi!");
  }
}

// --- Функція обробки подій WebSocket ---
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
    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT)
    {
      data[len] = 0;
      String message = (char *)data;

      if (message == "RESET")
      {
        Serial.println("Reboot command received!");
        ESP.restart();
      }
      else
      {
        // --- ТУТ БУЛА ПОМИЛКА ---
        StaticJsonDocument<200> doc;
        // 1. Парсимо JSON
        DeserializationError error = deserializeJson(doc, message);

        if (!error)
        {
          // 2. Зчитуємо дані
          const char *l1 = doc["line1"];
          const char *l2 = doc["line2"];

          const char *conSSID = doc["conSSID"];
          const char *conPASS = doc["conPASS"];

          if (l1 && l2)
          {
            strlcpy(customSSID, l1, sizeof(customSSID));
            strlcpy(customPass, l2, sizeof(customPass));

            // 3. ЗАПУСКАЄМО ПРОЦЕС
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
  }
}

void setup()
{
  Serial.begin(115200);

  // 1. Монтуємо файлову систему
  if (!LittleFS.begin(true))
  {
    Serial.println("Mount Failed");
    return;
  }

  // 2. Налаштування SPI
  pinMode(pin_SS, OUTPUT);
  digitalWrite(pin_SS, HIGH);
  SPI.begin(pin_SCLK, pin_MISO, pin_MOSI, pin_SS);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));

  // 3. Запускаємо власну точку доступу (щоб можна було зайти)
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssidAR, passwordAR);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  // 4. Перевіряємо, чи є файли сайту
  bool filesExist = LittleFS.exists("/index.html") && LittleFS.exists("/style.css") && LittleFS.exists("/script.js");

  ws.onEvent(onEvent);
  server.addHandler(&ws);

  // 5. Вирішуємо, що показувати
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

#define SAMPLES_PER_PACKET 200
#define SAMPLING_DELAY_MICROS 500

uint16_t rawValues[SAMPLES_PER_PACKET];

void loop()
{
  ws.cleanupClients();

  if (shouldUpdate)
  {
    startUpdateProcess(); // Запускаємо довгий процес
    shouldUpdate = false; // Скидаємо прапорець, щоб не запустити знову
  }
  if (shouldCon)
  {
    startCon();
    shouldCon = false;
  }

  if (!shouldCon && !shouldUpdate && ws.count() > 0)
  {
    for (int i = 0; i < SAMPLES_PER_PACKET; i++)
    {
      digitalWrite(pin_SS, LOW);
      uint16_t rawResult = SPI.transfer16(0x0000);
      digitalWrite(pin_SS, HIGH);
      rawResult = rawResult >> 1;
      rawValues[i] = rawResult & 0x0FFF;
      Serial.println(rawValues[i]);
      delayMicroseconds(SAMPLING_DELAY_MICROS);
    }
    SPI.endTransaction();
    ws.binaryAll((uint8_t *)rawValues, SAMPLES_PER_PACKET * 2);
  }
}

