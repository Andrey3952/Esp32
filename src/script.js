var gateway = `ws://${window.location.hostname}/ws`;
// var gateway = `ws://${window.location.hostname}:8765/ws`;
// var gateway = `ws://192.168.0.176/ws`;


var websocket;
var myChart;
var needsUpdate = false; // Прапорець

// Змінні конфігурації
var maxDataPoints = 50; // Це наш t (вісь X)
var yAxisRange = 150;   // Це межа Y (від -150 до +150)

var st = 0;
var cu = 0;
var T = 0;
var Tbt = 0;
var Tc = 1;

var prevVal = 0;       // Зберігаємо попереднє значення точки
var threshold = 127;

let num = Math.floor(Math.random() * 256);

function renderLoop() {

    if (needsUpdate && myChart) {
        myChart.update('none'); // Малюємо тільки якщо є нові дані
        needsUpdate = false;    // Скидаємо прапорець
    }
    requestAnimationFrame(renderLoop); // Плануємо наступний кадр
}

// --- 1. Ініціалізація графіка ---
window.addEventListener('load', function () {
    initChart();
    initWebSocket();
    renderLoop();

    // Ініціалізуємо крутилки
    createKnob('knobX', 'valX', 0.01, 10000, 50, (val) => {
        maxDataPoints = val; // Оновлюємо змінну X
    });

    createKnob('knobY', 'valY', 0.01, 10000, 150, (val) => {
        yAxisRange = val;
        updateYScale(); // Одразу оновлюємо вигляд графіка
    });
});

function initChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Signal',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0, // Трохи згладимо лінію
                stepped: true,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { intersect: false },
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Функція для динамічної зміни Y без перестворення графіка
function updateYScale() {
    if (myChart) {
        myChart.options.scales.y.min = -yAxisRange;
        myChart.options.scales.y.max = yAxisRange;
        myChart.update('none'); // 'none' для швидкодії (без анімації)
    }
}

// --- 2. WebSocket ---
function initWebSocket() {
    console.log('Connecting to WebSocket...');
    websocket = new WebSocket(gateway);
    websocket.binaryType = "arraybuffer";
    websocket.onopen = () => console.log('Connection opened');
    websocket.onclose = () => setTimeout(initWebSocket, 2000);

    websocket.onmessage = function (event) {
        if (event.data instanceof ArrayBuffer) {
            const points = new Uint8Array(event.data);

            // Тимчасові буфери для нових даних (щоб не чіпати графік 100 разів)
            let newLabels = [];
            let newData = [];
            let lastValue = 0; // Для виводу на екран

            // Проходимо по кожному числу (ТІЛЬКИ ЛОГІКА)
            points.forEach(function (point) {
                var dataVal = point;
                lastValue = dataVal; // Запам'ятовуємо останнє

                // --- Ваша логіка тригера ---
                var isRisingEdge = (prevVal < threshold && dataVal >= threshold);

                if (isRisingEdge) {
                    if (st == 0) {
                        // Початок хвилі
                        st = 1;
                        cu = 0;
                    }
                    else if (st == 1 && cu > 10) {
                        // maxDataPoints = cu; 
                        st = 2;
                        // cu = 0;
                    }
                }

                if (st == 1) {
                    cu++;
                }

                // 3. Зберігаємо поточне значення як "минуле" для наступного кроку
                prevVal = dataVal;


                // ---------------------------

                // Замість Date() (дуже повільно), краще просто лічильник або порожній рядок, 
                // якщо час не критичний. Якщо час треба - то так:
                newLabels.push(""); // Пуста мітка швидша
                newData.push(dataVal);
            });

            // 1. Оновлюємо цифру НА ЕКРАНІ (1 раз за пакет, а не 100)
            document.getElementById('sensorValue').innerHTML = lastValue;

            // 2. Масове додавання даних у графік
            // Використовуємо spread operator (...) це набагато швидше
            myChart.data.labels.push(...newLabels);
            myChart.data.datasets[0].data.push(...newData);

            // 3. Масове видалення старих даних (ОДИН РАЗ)
            // Обчислюємо скільки треба видалити
            let totalPoints = myChart.data.labels.length;
            let pointsToRemove = totalPoints - maxDataPoints;

            if (pointsToRemove > 0) {
                // splice видаляє пачку даних миттєво
                myChart.data.labels.splice(0, pointsToRemove);
                myChart.data.datasets[0].data.splice(0, pointsToRemove);
            }

            // 4. Оновлюємо графік
            // myChart.update('none');
            needsUpdate = true;
        }
    };
}
function updateChart(val) {
    const now = new Date();
    const timeLabel = now.getSeconds() + ":" + now.getMilliseconds();

    myChart.data.labels.push(timeLabel);
    myChart.data.datasets[0].data.push(val);

    // Використовуємо змінну maxDataPoints, яку змінює перша крутилка
    while (myChart.data.labels.length > maxDataPoints) {
        myChart.data.labels.shift();
        myChart.data.myChart.data.datasets[0].data = [];[0].data.shift();
    }
    myChart.update('none'); // Режим 'none' дуже важливий для FPS

}

// --- 3. Універсальна логіка Крутилки (Knob Factory) ---
function createKnob(elementId, displayId, min, max, startVal, onChangeCallback) {
    const knob = document.getElementById(elementId);
    const display = document.getElementById(displayId);
    let value = startVal;
    let isDragging = false;

    // Встановлюємо початковий кут
    updateKnobVisuals();

    // Події миші
    knob.addEventListener('mousedown', (e) => { isDragging = true; });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));

    // Події тачу (телефон)
    knob.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); });
    document.addEventListener('touchend', () => { isDragging = false; });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    function handleMove(clientX, clientY) {
        if (!isDragging) return;

        const rect = knob.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Рахуємо кут
        const dx = clientX - centerX;
        const dy = clientY - centerY;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        if (angle < 0) angle += 360;

        // Конвертуємо кут (0-360) у значення (min-max)
        value = Math.round(min + (max - min) * (angle / 360));

        updateKnobVisuals(angle);

        // Викликаємо функцію, яку передали (оновлення графіка або змінної)
        if (onChangeCallback) onChangeCallback(value);
    }

    function updateKnobVisuals(angle) {
        // Якщо кут не передали, рахуємо з поточного value
        if (angle === undefined) {
            angle = (value - min) / (max - min) * 360;
        }
        knob.style.transform = `rotate(${angle}deg)`;
        knob.textContent = value;
        display.textContent = (elementId === 'knobY' ? '+/- ' : '') + value;
    }

}

// 1. Знаходимо елементи на сторінці
const inputElement = document.getElementById('InputT');
const buttonElement = document.getElementById('BtnT');

// 2. Додаємо "слухача" подій на кнопку
buttonElement.addEventListener('click', function () {

    const Tc = Number(inputElement.value);

    maxDataPoints = 1;
    for (let i = 1; i < Tc; i++) {
        maxDataPoints += cu;
    }
    Tbt = 0;


});



function rebootESP() {
    if (confirm("Ви точно хочете перезавантажити пристрій?")) {
        // Перевіряємо, чи підключений сокет (стан OPEN = 1)
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log("Sending RESET command...");
            websocket.send("RESET");
            setTimeout(() => location.reload(), 3000);
        } else {
            alert("Помилка: Немає з'єднання з ESP32!");
        }
    }
}

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