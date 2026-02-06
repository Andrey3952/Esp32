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

let arr = [];

var stop = 0;
var root = 1;

var prevVal = 0;       // Зберігаємо попереднє значення точки
var threshold = 0;

var globalX = 0;

let num = Math.floor(Math.random() * 256);

function renderLoop() {

    if (needsUpdate && myChart) {
        myChart.update('none'); // Малюємо тільки якщо є нові дані
        needsUpdate = false;    // Скидаємо прапорець
    }
    requestAnimationFrame(renderLoop); // Плануємо наступний кадр
}

function closeMenu() {
    const menu = document.getElementById("setmenu");

    // 1. Додаємо клас, щоб запустити анімацію зникання
    menu.classList.add("hiding");

    // 2. Чекаємо 300мс (стільки ж, скільки триває анімація в CSS)
    setTimeout(() => {
        // 3. Реально ховаємо елемент
        menu.style.display = "none";

        // 4. Прибираємо клас hiding, щоб наступного разу вікно відкрилось нормально
        menu.classList.remove("hiding");
    }, 300);
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
            datasets: [{
                label: 'Signal',
                data: [],
                // borderColor: 'rgb(75, 192, 192)',
                borderColor: 'rgb(245, 110, 174)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0, // Трохи згладимо лінію
                stepped: false,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            interaction: { intersect: false },
            scales: {
                x: {
                    type: 'linear', // <--- ЗМІНЮЄМО ТИП ОСІ
                    display: true,
                },
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

            // let newLabels = [];
            let newData = [];
            let lastValue = 0;

            points.forEach(function (point) {
                var dataVal = ((point * 10) / 4095) - 5;
                // var dataVal = point;



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

                lastValue = dataVal; // для відображення цифри

                // newLabels.push(""); <--- ВИДАЛЯЄМО

                // ДОДАЄМО ТОЧКУ З КООРДИНАТОЮ X

                newData.push({ x: globalX++, y: dataVal });
            });

            if (stop == 0) {

                // 1. Оновлюємо цифру НА ЕКРАНІ (1 раз за пакет, а не 100)
                document.getElementById('sensorValue').innerHTML = lastValue;

                // myChart.data.labels.push(...newLabels);
                myChart.data.datasets[0].data.push(...newData);

                let currentLength = myChart.data.datasets[0].data.length;

                if (currentLength > maxDataPoints) {
                    let pointsToRemove = currentLength - maxDataPoints;
                    myChart.data.datasets[0].data.splice(0, pointsToRemove);
                }

                needsUpdate = true;
            }
        }
        else {
            document.getElementById("sensorValue").innerText = event.data;
            if (event.data == "WiFi OK!") {
                document.getElementById("setmenu").style.display = "none";
                document.getElementById("sen").style.display = "none";
                location.reload();


            }

            if (event.data == "Успіх! Перезавантаження...") {
                // document.getElementById("setmenu").style.display = "none";
                location.reload();
            }




        }
    };
}
function updateChart(val) {
    // const now = new Date(); // Більше не потрібно для осі X

    myChart.data.datasets[0].data.push({ x: globalX++, y: val });

    // ВИПРАВЛЕНО: Перевіряємо довжину даних
    while (myChart.data.datasets[0].data.length > maxDataPoints) {
        myChart.data.datasets[0].data.shift();
    }
    myChart.update('none');
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
    // document.getElementById("setmenu").style.display = "none";
    closeMenu();
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


// document.getElementsByClassName("chart-container")[0].addEventListener('click', function () {
//     if (stop == 0) {
//         stop = 1;
//         // document.getElementById('BTStop').textContent = "Продовжити";
//     }
//     else {
//         stop = 0;
//         // document.getElementById('BTStop').textContent = "Зупинити";
//     }
// });


document.getElementsByClassName("chart-container")[0].addEventListener('dblclick', function () {
    if (root == 1) {
        // Скидаємо вигляд меню при відкритті
        document.getElementById("form-block").style.display = "block"; // Показуємо форму
        document.getElementById("sen").style.display = "none";         // Ховаємо лоадер

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
        // ХОВАЄМО ТІЛЬКИ ПОЛЯ, А НЕ ВСЮ КАРТКУ
        document.getElementById("form-block").style.display = "none";

        // ПОКАЗУЄМО ЛОАДЕР
        document.getElementById("sen").style.display = "block";

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
        // ХОВАЄМО ТІЛЬКИ ПОЛЯ
        document.getElementById("form-block").style.display = "none";

        // ПОКАЗУЄМО ЛОАДЕР
        document.getElementById("sen").style.display = "block";

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
const labelY = document.getElementById('rangeY');
const labelX = document.getElementById('rangeX');

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

    // 3. Миттєво обрізаємо графік
    if (stop == 0) {
        // ВИПРАВЛЕНО: Дивимось на довжину даних, а не labels
        let currentLength = myChart.data.datasets[0].data.length;

        if (currentLength > maxDataPoints) {
            let pointsToRemove = currentLength - maxDataPoints;

            // ВИПРАВЛЕНО: Видаляємо тільки з datasets, labels не чіпаємо
            myChart.data.datasets[0].data.splice(0, pointsToRemove);

            needsUpdate = true;
        }
    }
});