#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

const int pin_SCLK = 18;
const int pin_MISO = 4;
const int pin_MOSI = 23;
const int pin_SS = 5;
const char *ssid = "2.4G";           // Ваша назва WiFi
const char *password = "9999999999"; // Ваш пароль WiFi

// --- 1. Оголошуємо зовнішні ресурси (те, що прописали в platformio.ini) ---
// index.html
extern const char index_html_start[] asm("_binary_src_index_html_start");
extern const char index_html_end[] asm("_binary_src_index_html_end");

// style.css
extern const char style_css_start[] asm("_binary_src_style_css_start");
extern const char style_css_end[] asm("_binary_src_style_css_end");

// script.js
extern const char script_js_start[] asm("_binary_src_script_js_start");
extern const char script_js_end[] asm("_binary_src_script_js_end");
// Створюємо об'єкт сервера на порту 80
AsyncWebServer server(80);
// Створюємо об'єкт WebSocket на шляху /ws
AsyncWebSocket ws("/ws");

// unsigned long timerDelay = 100; // Відправляти дані кожні 100 мс

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

  ws.onEvent(onEvent);
  server.addHandler(&ws);

  // 1. HTML
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    // ВІДНІМАЄМО 1, щоб прибрати нульовий байт
    size_t size = (index_html_end - index_html_start) - 1; 
    AsyncWebServerResponse *response = request->beginResponse(200, "text/html", (uint8_t*)index_html_start, size);
    request->send(response); });

  // 2. CSS
  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    // ВІДНІМАЄМО 1
    size_t size = (style_css_end - style_css_start) - 1; 
    AsyncWebServerResponse *response = request->beginResponse(200, "text/css", (uint8_t*)style_css_start, size);
    request->send(response); });

  // 3. JS (Тут помилка була критичною)
  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    // ВІДНІМАЄМО 1
    size_t size = (script_js_end - script_js_start) - 1; 
    AsyncWebServerResponse *response = request->beginResponse(200, "application/javascript", (uint8_t*)script_js_start, size);
    request->send(response); });
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