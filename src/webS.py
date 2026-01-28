import asyncio
import websockets

# Адреса вашого заліза (ESP32/STM32)
HARDWARE_URL = "ws://192.168.0.176/ws"

# Список активних підключень браузерів
connected_browsers = set()

async def hardware_client():
    """Клієнт, що отримує дані від ESP32"""
    while True:
        try:
            async with websockets.connect(HARDWARE_URL) as ws_hw:
                print(f"Підключено до заліза: {HARDWARE_URL}")
                while True:
                    # Отримуємо дані (бінарні або текст)
                    data = await ws_hw.recv()
                    
                    # Якщо є підключені браузери — пересилаємо їм
                    if connected_browsers:
                        # Створюємо копію списку для ітерації
                        await asyncio.gather(
                            *[browser.send(data) for browser in connected_browsers],
                            return_exceptions=True
                        )
        except Exception as e:
            print(f"Помилка зв'язку з залізом: {e}. Перепідключення через 5 сек...")
            await asyncio.sleep(5)

async def browser_handler(websocket):
    """Сервер, що обробляє підключення від браузера"""
    print("Новий браузер підключився")
    connected_browsers.add(websocket)
    try:
        async for message in websocket:
            # Тут можна обробляти команди ВІД браузера ДО заліза, якщо треба
            pass
    finally:
        print("Браузер відключився")
        connected_browsers.remove(websocket)

async def main():
    # Запускаємо сервер для браузерів на порту 80 (або іншому)
    server = websockets.serve(browser_handler, "0.0.0.0", 80)
    
    # Запускаємо обидва процеси одночасно
    await asyncio.gather(server, hardware_client())

if __name__ == "__main__":
    asyncio.run(main())