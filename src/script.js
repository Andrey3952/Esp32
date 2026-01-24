var gateway = `ws://${window.location.hostname}/ws`;
// var gateway = `ws://${window.location.hostname}:8765/ws`;
// var gateway = `ws://192.168.0.176/ws`;


// var websocket;
var myChart;
var needsUpdate = false; // Прапорець

// Змінні конфігурації
var maxDataPoints = 50; // Це наш t (вісь X)
var yAxisRange = 5;   // Це межа Y (від -150 до +150)

var st = 0;
var cu = 0;
var T = 0;
var Tbt = 0;

var stop = 0;
var root = 0;

var prevVal = 0;       // Зберігаємо попереднє значення точки
var threshold = 0;

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
                // borderColor: 'rgb(75, 192, 192)',
                borderColor: 'rgb(245, 110, 174)',
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
            const points = new Uint16Array(event.data);

            let newLabels = [];
            let newData = [];
            let lastValue = 0;

            points.forEach(function (point) {
                // var dataVal = ((point * 10) / 4095) - 5;
                var dataVal = point;


                lastValue = dataVal;
                var isRisingEdge = (prevVal < threshold && dataVal >= threshold);

                if (isRisingEdge) {
                    if (st == 0) {
                        st = 1;
                        cu = 0;
                    }
                    else if (st == 1 && cu > 10) {
                        st = 2;
                    }
                }

                if (st == 1) {
                    cu++;
                }

                prevVal = dataVal;

                newLabels.push(""); // Пуста мітка швидша
                newData.push(dataVal);
            });
            if (stop == 0) {
                // 1. Оновлюємо цифру НА ЕКРАНІ (1 раз за пакет, а не 100)
                document.getElementById('sensorValue').innerHTML = lastValue;

                myChart.data.labels.push(...newLabels);
                myChart.data.datasets[0].data.push(...newData);

                let totalPoints = myChart.data.labels.length;
                let pointsToRemove = totalPoints - maxDataPoints;

                if (pointsToRemove > 0) {
                    // splice видаляє пачку даних миттєво
                    myChart.data.labels.splice(0, pointsToRemove);
                    myChart.data.datasets[0].data.splice(0, pointsToRemove);
                }

                needsUpdate = true;
            }
        }
        else {
            document.getElementById("sensorValue").innerText = event.data;
            if (event.data == "WiFi OK!") {
                document.getElementById("setmenu").style.display = "none";
            }

            if (event.data == "Успіх! Перезавантаження...") {
                // document.getElementById("setmenu").style.display = "none";
                location.reload();
            }




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
        myChart.data.datasets[0].data.shift();
    }
    myChart.update('none'); // Режим 'none' дуже важливий для FPS

}

// document.getElementById('BtnT').addEventListener('click', function () {
//     const Tc = (Number(document.getElementById('InputT').value)) + 1;
//     maxDataPoints = 1;
//     for (let i = 1; i < Tc; i++) {
//         maxDataPoints += cu;
//     }
//     Tbt = 0;
// });



// document.getElementById('settings').addEventListener('click', function () {
//     document.getElementById("setmenu").style.display = "flex";
//     // document.getElementById("v").style.display = "flex";

// });

document.getElementById('setmenu').addEventListener('dblclick', function () {
    document.getElementById("setmenu").style.display = "none";
});

document.getElementsByClassName("chart-container")[0].addEventListener('click', function () {
    if (stop == 0) {
        stop = 1;
        // document.getElementById('BTStop').textContent = "Продовжити";
    }
    else {
        stop = 0;
        // document.getElementById('BTStop').textContent = "Зупинити";
    }
});


document.getElementsByClassName("chart-container")[0].addEventListener('dblclick', function () {
    if (root == 1) {
        document.getElementById("setmenu").style.display = "flex";
    }

});


function sendWifi() {
    const ssid = document.getElementById("ssid").value;
    const pass = document.getElementById("pass").value;

    if (!ssid) {
        alert("SSID не може бути порожнім");
        return;
    }

    if (websocket.readyState === WebSocket.OPEN) {
        document.getElementById("setmenu-content").style.display = "none";
        document.getElementById("sen").style.display = "flex";
        websocket.send(JSON.stringify({
            line1: ssid,
            line2: pass
        }));
    } else {
        alert("WebSocket не підключений");
    }

}

function conWifi() {

    const ssid = document.getElementById("ssid").value;
    const pass = document.getElementById("pass").value;

    if (!ssid) {
        alert("SSID не може бути порожнім");
        return;
    }

    if (websocket.readyState === WebSocket.OPEN) {
        document.getElementById("setmenu-content").style.display = "none";
        document.getElementById("sen").style.display = "flex";
        websocket.send(JSON.stringify({
            conSSID: ssid,
            conPASS: pass
        }));
    } else {
        alert("WebSocket не підключений");
    }
}


// Знаходимо елементи
const rangeY = document.getElementById('rangeY');
const rangeX = document.getElementById('rangeX');
const labelY = document.getElementById('valY');
const labelX = document.getElementById('valX');

// --- Обробка зміни масштабу Y ---
rangeY.addEventListener('input', function () {
    // 1. Оновлюємо змінну
    yAxisRange = Number(this.value);

    // 2. Оновлюємо підпис
    labelY.innerText = -yAxisRange;

    // myChart.options.scales.y.min = -yAxisRange;
    //     myChart.options.scales.y.max = yAxisRange;

    // 3. Викликаємо вашу функцію оновлення осі
    updateYScale();
});

// --- Обробка зміни масштабу X ---
rangeX.addEventListener('input', function () {
    // 1. Оновлюємо змінну конфігурації
    maxDataPoints = Number(this.value);

    // 2. Оновлюємо підпис
    labelX.innerText = maxDataPoints;

    // 3. (Опціонально) Миттєво обрізаємо графік, щоб не чекати нових даних
    // Якщо ми зменшили масштаб, зайві точки треба видалити одразу
    if (stop == 0) {
        if (myChart.data.labels.length > maxDataPoints) {
            let pointsToRemove = myChart.data.labels.length - maxDataPoints;
            myChart.data.labels.splice(0, pointsToRemove);
            myChart.data.datasets[0].data.splice(0, pointsToRemove);
            needsUpdate = true; // Кажемо renderLoop перемалювати
        }
    }
});

