#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <HTTPClient.h>

const int pin_SCLK = 18;
const int pin_MISO = 4;
const int pin_MOSI = 23;
const int pin_SS = 5;
const char *ssid = "TP-Link";        // Ваша назва WiFi
const char *password = "9999999999"; // Ваш пароль WiFi
// https://raw.githubusercontent.com/Andrey3952/Esp32/main/src/

const String gh_base = "https://raw.githubusercontent.com/Andrey3952/Esp32/main/src/";
const String file_html = "index.html";
const String file_css = "style.css";
const String file_js = "script.js";

// Створюємо об'єкт сервера на порту 80
AsyncWebServer server(80);
// Створюємо об'єкт WebSocket на шляху /ws
AsyncWebSocket ws("/ws");

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

// --- Функція обробки подій WebSocket ---
void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len)
{
  if (type == WS_EVT_CONNECT)
  {
    Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
  }
  else if (type == WS_EVT_DISCONNECT)
  {
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
  }
}

void setup()
{
  Serial.begin(115200);

  if (!LittleFS.begin(true))
  { // true = форматувати, якщо не вдалося змонтувати
    Serial.println("LittleFS Mount Failed");
    return;
  }

  pinMode(pin_SS, OUTPUT);
  digitalWrite(pin_SS, HIGH);
  SPI.begin(pin_SCLK, pin_MISO, pin_MOSI, pin_SS);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println(WiFi.localIP());

  Serial.println("Updating site from GitHub...");
  downloadFile(file_html);
  downloadFile(file_css);
  downloadFile(file_js);
  Serial.println("Update done.");

  ws.onEvent(onEvent);
  server.addHandler(&ws);

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  // Запуск сервера
  server.begin();
}

#define SAMPLES_PER_PACKET 200
#define SAMPLING_DELAY_MICROS 500

uint8_t rawValues[SAMPLES_PER_PACKET];

void loop()
{
  ws.cleanupClients();

  if (ws.count() > 0)
  {
    // 1. Збір даних (займе 100 мс)
    for (int i = 0; i < SAMPLES_PER_PACKET; i++)
    {
      digitalWrite(pin_SS, LOW);
      rawValues[i] = SPI.transfer(0x00);
      digitalWrite(pin_SS, HIGH);
      delayMicroseconds(SAMPLING_DELAY_MICROS);
    }

    // 2. Відправка
    ws.binaryAll(rawValues, SAMPLES_PER_PACKET);

    // delay(20); // Більше не потрібен, бо цикл і так довгий
  }
}