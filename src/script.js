// var gateway = `ws://${window.location.hostname}/ws`;
var gateway = `ws://192.168.0.176/ws`;
var websocket;
var uplot; // Об'єкт графіка

// Дані для uPlot зберігаються як масив масивів: [ [x1, x2...], [y1, y2...] ]
var dataX = [];
var dataY = [];

var needsUpdate = false;
var maxDataPoints = 500; // Початкове значення X
var yAxisRange = 5;      // Початкове значення Y

var stop = 0;
var root = 1;

// Логіка тригера (залишив вашу логіку)
var st = 0;
var cu = 0;
var prevVal = 0;
var threshold = 0;

var globalX = 0; // Глобальний лічильник часу

// --- Основний цикл малювання (60 FPS) ---
function renderLoop() {
    if (needsUpdate && uplot) {
        // uPlot приймає дані у форматі [ArrayX, ArrayY]
        uplot.setData([dataX, dataY]);
        needsUpdate = false;
    }
    requestAnimationFrame(renderLoop);
}

// --- Ініціалізація ---
window.addEventListener('load', function () {
    initChart();
    initWebSocket();
    renderLoop();
});

// Закриття меню
function closeMenu() {
    const menu = document.getElementById("setmenu");
    menu.classList.add("hiding");
    setTimeout(() => {
        menu.style.display = "none";
        menu.classList.remove("hiding");
    }, 300);
}

// --- Налаштування uPlot ---
function initChart() {
    const opts = {
        title: "Signal",
        width: document.getElementsByClassName("chart-container")[0].clientWidth,
        height: window.innerHeight * 0.6, // 60% висоти екрану

        scales: {
            x: {
                time: false, // У нас просто лічильник, не дати
            },
            y: {
                auto: false, // Вимикаємо авто-масштаб
                range: [-yAxisRange, yAxisRange] // Фіксуємо межі
            }
        },
        series: [
            {}, // Перша серія - це вісь X (завжди)
            {
                label: "Voltage",
                stroke: "rgb(245, 110, 174)", // Ваш рожевий колір
                width: 2,
                spanGaps: true // Оптимізація розривів
            }
        ],
        axes: [
            {
                // Налаштування осі X
                show: true,
                stroke: "#ccc",
                grid: { show: true, stroke: "#333", width: 1 }
            },
            {
                // Налаштування осі Y
                show: true,
                stroke: "#ccc",
                grid: { show: true, stroke: "#333", width: 1 }
            }
        ]
    };

    let chartDiv = document.getElementById('myChart');
    uplot = new uPlot(opts, [dataX, dataY], chartDiv);

    // Реакція на зміну розміру вікна
    window.addEventListener("resize", e => {
        uplot.setSize({
            width: document.getElementsByClassName("chart-container")[0].clientWidth,
            height: window.innerHeight * 0.6
        });
    });
}

// --- WebSocket ---
function initWebSocket() {
    console.log('Connecting to WebSocket...');
    websocket = new WebSocket(gateway);
    websocket.binaryType = "arraybuffer";

    websocket.onopen = () => console.log('Connection opened');

    websocket.onclose = () => {
        console.log('Connection closed');
        setTimeout(initWebSocket, 2000);
    };

    websocket.onmessage = function (event) {
        if (event.data instanceof ArrayBuffer) {
            const points = new Uint16Array(event.data);
            let lastValue = 0;

            // 1. Оптимізований цикл обробки
            // Якщо пакет великий (наприклад 4096), додавання по одному повільне.
            // Але для JS це норм. Головне - не перемальовувати графік всередині циклу.

            for (let i = 0; i < points.length; i++) {
                // Масштабування значення
                let dataVal = ((points[i] * 10) / 4095) - 5;
                lastValue = dataVal;

                // Ваша логіка тригера
                let isRisingEdge = (prevVal < threshold && dataVal >= threshold);
                if (isRisingEdge) {
                    if (st == 0) { st = 1; cu = 0; }
                    else if (st == 1 && cu > 10) { st = 2; }
                }
                if (st == 1) cu++;
                prevVal = dataVal;

                // ДОДАЄМО В МАСИВИ (тільки якщо не на паузі)
                if (stop == 0) {
                    dataX.push(globalX++);
                    dataY.push(dataVal);
                }
            }

            if (stop == 0) {
                // 2. Оновлюємо цифру
                document.getElementById('sensorValue').innerHTML = lastValue.toFixed(2);

                // 3. Обрізаємо масиви (аналог splice, але для двох масивів)
                // Щоб графік "їхав", видаляємо старі точки
                if (dataX.length > maxDataPoints) {
                    let pointsToRemove = dataX.length - maxDataPoints;
                    // slice швидше за splice для великих масивів
                    // Ми просто беремо "хвіст" масиву
                    dataX = dataX.slice(pointsToRemove);
                    dataY = dataY.slice(pointsToRemove);
                }

                // 4. Ставимо прапорець для renderLoop
                needsUpdate = true;
            }

        } else {
            // Текстові повідомлення (WiFi статус тощо)
            handleTextMessage(event.data);
        }
    };
}

function handleTextMessage(msg) {
    document.getElementById("sensorValue").innerText = msg;
    if (msg == "WiFi OK!" || msg == "Успіх! Перезавантаження...") {
        document.getElementById("setmenu").style.display = "none";
        document.getElementById("sen").style.display = "none";
        // location.reload(); // Можна розкоментувати якщо треба
    }
}

// --- Керування ---

// Масштаб Y
const rangeY = document.getElementById('rangeY');
const labelY = document.getElementById('labelY'); // Створив span в HTML

rangeY.addEventListener('input', function () {
    yAxisRange = Number(this.value);
    // Оновлюємо підпис (якщо ви додали span з id="labelY")
    if (labelY) labelY.innerText = yAxisRange;

    // В uPlot масштабування робиться так:
    if (uplot) {
        uplot.setScale('y', { min: -yAxisRange, max: yAxisRange });
    }
});

// Масштаб X (Timebase)
const rangeX = document.getElementById('rangeX');
const labelX = document.getElementById('labelX'); // Створив span в HTML

rangeX.addEventListener('input', function () {
    maxDataPoints = Number(this.value);
    if (labelX) labelX.innerText = maxDataPoints;

    // При зменшенні масштабу X треба обрізати масиви негайно
    if (dataX.length > maxDataPoints) {
        let start = dataX.length - maxDataPoints;
        dataX = dataX.slice(start);
        dataY = dataY.slice(start);
        needsUpdate = true;
    }
});

// Кнопка паузи (клік по графіку)
document.getElementsByClassName("chart-container")[0].addEventListener('click', function () {
    stop = !stop; // Перемикач 0/1
});

// Відкриття меню (подвійний клік)
document.getElementsByClassName("chart-container")[0].addEventListener('dblclick', function () {
    if (root == 1) {
        document.getElementById("form-block").style.display = "block";
        document.getElementById("sen").style.display = "none";
        document.getElementById("setmenu").style.display = "flex";
    }
});

document.getElementById('setmenu').addEventListener('dblclick', function () {
    closeMenu();
});

// WiFi функції
function sendWifi() {
    const ssid = document.getElementById("ssid").value;
    const pass = document.getElementById("pass").value;
    if (websocket.readyState === WebSocket.OPEN) {
        document.getElementById("form-block").style.display = "none";
        document.getElementById("sen").style.display = "block";
        websocket.send(JSON.stringify({ line1: ssid, line2: pass }));
    } else {
        alert("WebSocket disconnect");
    }
}

function conWifi() {
    const ssid = document.getElementById("ssid").value;
    const pass = document.getElementById("pass").value;
    if (websocket.readyState === WebSocket.OPEN) {
        document.getElementById("form-block").style.display = "none";
        document.getElementById("sen").style.display = "block";
        websocket.send(JSON.stringify({ conSSID: ssid, conPASS: pass }));
    } else {
        alert("WebSocket disconnect");
    }
}