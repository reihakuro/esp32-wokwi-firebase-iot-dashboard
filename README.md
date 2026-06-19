# 🌐 Nexus Smart IoT Dashboard - Wokwi & Firebase Bridge

Chào bạn! Mình đã hoàn thiện giao diện trang web quản lý IoT siêu đẹp, trực quan và hiện đại theo đúng mô hình truyền dẫn dữ liệu: **Wokwi (ESP32) ➡️ Firebase (JSON) ➡️ Web Dashboard**.

Dự án đã được lưu tại thư mục workspace của bạn: `d:\SUBJECTS\TT_IOT\WOKWI FIREBASE WEB`.

---

## 🎨 Tổng quan Giao diện Dashboard (Web)

Giao diện Web được thiết kế theo phong cách **Glassmorphism (kính mờ)** thời thượng với các tính năng:
- **DHT22**: Hiển thị Nhiệt độ & Độ ẩm dạng vòng tròn động + Biểu đồ đường thời gian thực (Chart.js) mượt mà.
- **MQ2**: Hiển thị nồng độ khói/gas (PPM). Khi nồng độ vượt quá **300 PPM**, hệ thống tự động kích hoạt **Còi hú ảo & Banner đỏ nhấp nháy** cảnh báo nguy hiểm.
- **MPU6050**: Hiển thị Gia tốc (X, Y, Z) và Góc xoay (Roll, Pitch, Yaw). Đặc biệt có **Mô hình khối 3D tự động nghiêng/xoay** theo góc quay thực tế của cảm biến!
- **SSD1306 OLED**: Màn hình OLED giả lập hiển thị chính xác các dòng chữ đang có trên OLED thực tế ở Wokwi, đồng thời cho phép bạn **nhập chữ từ Web để gửi ngược lại hiển thị lên OLED**.
- **LED đơn**: Nút gạt bật/tắt (Toggle Switch) cực nhạy, phản hồi ánh sáng LED phát sáng rực rỡ và đồng bộ lên Firebase.
- **Stepper Motor & Driver**: Bộ điều khiển tốc độ (RPM) bằng thanh trượt (slider), chiều quay (CW/CCW), quay theo góc (90 độ, 180 độ) hoặc chạy liên tục. **Bánh răng cưa 3D trên Web sẽ tự động xoay nhanh/chậm** theo tốc độ động cơ thực tế.
- **Firebase Connection Panel**: Khu vực cấu hình địa chỉ Firebase riêng.
- **Simulation Mode (Chế độ mô phỏng)**: Khi chưa kết nối Firebase, trang web tự kích hoạt giả lập thay đổi chỉ số tự nhiên để bạn có thể thuyết trình và test giao diện ngay lập tức!

---

## 💾 Cấu trúc dữ liệu JSON trên Firebase Realtime Database

Để Web và ESP32 hiểu nhau, cấu trúc dữ liệu lưu trên Firebase Realtime Database sẽ có dạng JSON chuẩn như sau:

```json
{
  "iot_data": {
    "dht22": {
      "temperature": 28.4,
      "humidity": 65.2
    },
    "mq2": {
      "gas": 120
    },
    "mpu6050": {
      "acc_x": 0.12,
      "acc_y": -0.05,
      "acc_z": 0.98,
      "roll": 12.4,
      "pitch": -4.8,
      "yaw": 156.2
    },
    "oled": {
      "text": "NEXUS SMART IOT\nTemp: 28.4 C\nHum:  65.2 %"
    },
    "led": 0,
    "stepper": {
      "direction": "CW",
      "speed": 40,
      "steps": 0,
      "running": 1
    }
  }
}
```

---

## 🛠️ Hướng dẫn kết nối và chạy thử nghiệm

### Bước 1: Trải nghiệm Giao diện Web
Bạn chỉ cần mở trực tiếp file `index.html` bằng trình duyệt (Double-click vào file `index.html` trong thư mục `d:\SUBJECTS\TT_IOT\WOKWI FIREBASE WEB`). 
- Giao diện sẽ tự động chạy ở **Chế độ mô phỏng (Simulation Mode)**.
- Bạn hãy thử gạt nút **LED đơn**, chỉnh thanh trượt **động cơ bước** hoặc nhập văn bản gửi lên màn hình **OLED** để thấy các hiệu ứng chuyển động và thông báo mượt mà.

### Bước 2: Tạo Firebase Realtime Database
1. Truy cập [Firebase Console](https://console.firebase.google.com/) và tạo một dự án mới.
2. Chọn **Build > Realtime Database > Create Database**.
3. Chọn vị trí server và thiết lập Rules ở chế độ test (đọc/ghi tự do) để Wokwi kết nối nhanh:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. Copy đường dẫn cơ sở dữ liệu của bạn (dạng: `https://your-project-rtdb.firebaseio.com/`).

### Bước 3: Nạp Code mẫu cho ESP32 trên Wokwi
Dưới đây là đoạn code Arduino C++ hoàn chỉnh sử dụng thư viện **Firebase ESP32 Client** để bạn nạp vào ESP32 trên Wokwi nhằm kết nối tất cả các linh kiện vật lý lên Web:

```cpp
#include <WiFi.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <FirebaseESP32.h>

// --- Cấu hình WiFi & Firebase ---
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define FIREBASE_HOST "YOUR-PROJECT-ID-default-rtdb.firebaseio.com" // Thay bằng HOST Firebase của bạn (không chứa https:// và /)
#define FIREBASE_AUTH "YOUR_DATABASE_SECRET" // Nếu có đặt Secret, hoặc bỏ trống

// --- Khai báo chân linh kiện ---
#define DHTPIN 15
#define DHTTYPE DHT22
#define LED_PIN 2
#define STEP_PIN 12
#define DIR_PIN 14
#define MQ2_ANALOG_PIN 34

// Cấu hình màn hình OLED SSD1306 (I2C)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Khởi tạo các cảm biến
DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;

// Khởi tạo Firebase
FirebaseData fbData;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

// Các biến lưu trạng thái thiết bị
unsigned long lastSend = 0;
int ledState = 0;
String oledText = "WAITING...";
String stepperDir = "CW";
int stepperSpeed = 0;
int stepperSteps = 0;
int stepperRunning = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);

  // Khởi động DHT22
  dht.begin();

  // Khởi động OLED I2C
  if(!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(WHITE);
  oled.setCursor(0, 10);
  oled.println("Connecting WiFi...");
  oled.display();

  // Khởi động MPU6050 I2C
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
  }

  // Kết nối WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  // Cấu hình Firebase
  fbConfig.host = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  oled.clearDisplay();
  oled.setCursor(0, 10);
  oled.println("System Ready!");
  oled.display();
}

void loop() {
  // 1. Đọc dữ liệu từ Web (Firebase) xuống ESP32 mỗi 1 giây
  if (millis() - lastSend > 1500) {
    lastSend = millis();

    // --- Đọc trạng thái LED ---
    if (Firebase.getInt(fbData, "/iot_data/led")) {
      if (fbData.dataType() == "int") {
        ledState = fbData.intData();
        digitalWrite(LED_PIN, ledState);
      }
    }

    // --- Đọc dữ liệu gửi màn hình OLED ---
    if (Firebase.getString(fbData, "/iot_data/oled/text")) {
      oledText = fbData.stringData();
      oled.clearDisplay();
      oled.setCursor(0, 10);
      oled.println(oledText);
      oled.display();
    }

    // --- Đọc dữ liệu Động cơ bước ---
    if (Firebase.getJSON(fbData, "/iot_data/stepper")) {
      FirebaseJson &json = fbData.jsonObject();
      FirebaseJsonData jsonData;
      
      json.get(jsonData, "direction");
      if (jsonData.success) stepperDir = jsonData.stringValue;
      
      json.get(jsonData, "speed");
      if (jsonData.success) stepperSpeed = jsonData.intValue;
      
      json.get(jsonData, "running");
      if (jsonData.success) stepperRunning = jsonData.intValue;

      json.get(jsonData, "steps");
      if (jsonData.success) stepperSteps = jsonData.intValue;
    }

    // 2. Đọc cảm biến vật lý & Đẩy từ ESP32 lên Web (Firebase)
    float temp = dht.readTemperature();
    float humid = dht.readHumidity();
    int gasPPM = analogRead(MQ2_ANALOG_PIN); // Đọc MQ2

    sensors_event_t a, g, temp_mpu;
    mpu.getEvent(&a, &g, &temp_mpu);

    // Tính toán góc quay Roll & Pitch cơ bản từ Gia tốc MPU6050
    float roll = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / PI;
    float pitch = atan2(-a.acceleration.x, sqrt(a.acceleration.y*a.acceleration.y + a.acceleration.z*a.acceleration.z)) * 180.0 / PI;
    float yaw = g.gyro.z * 180.0 / PI; // Tích phân góc quay thô

    // Tạo gói JSON gửi lên Firebase
    FirebaseJson updateData;
    updateData.set("dht22/temperature", temp);
    updateData.set("dht22/humidity", humid);
    updateData.set("mq2/gas", gasPPM);
    updateData.set("mpu6050/acc_x", a.acceleration.x / 9.8); // Quy đổi về đơn vị g
    updateData.set("mpu6050/acc_y", a.acceleration.y / 9.8);
    updateData.set("mpu6050/acc_z", a.acceleration.z / 9.8);
    updateData.set("mpu6050/roll", roll);
    updateData.set("mpu6050/pitch", pitch);
    updateData.set("mpu6050/yaw", yaw);

    // Đẩy cập nhật lên Firebase
    Firebase.updateNode(fbData, "/iot_data", updateData);
  }

  // 3. Thực thi điều khiển động cơ bước (nếu đang bật chạy)
  if (stepperRunning == 1 && stepperSpeed > 0) {
    // Điều khiển chiều quay
    if (stepperDir == "CW") {
      digitalWrite(DIR_PIN, HIGH);
    } else {
      digitalWrite(DIR_PIN, LOW);
    }

    // Tạo xung điều khiển tốc độ (Speed càng cao, delay giữa các bước càng nhỏ)
    int microDelay = map(stepperSpeed, 1, 100, 3000, 500); 
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(microDelay);
    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(microDelay);
  }
}
```

### Bước 4: Trải nghiệm Kết nối Thực tế
1. Nhập **Firebase Database URL** của bạn vào khung cấu hình trên Web và bấm **Kết nối (Connect)**.
2. Web sẽ tắt chế độ mô phỏng và bắt đầu lắng nghe tín hiệu thực từ ESP32 trên Wokwi.
3. Khi bạn làm thay đổi chỉ số cảm biến trên Wokwi (ví dụ click vào DHT22 tăng nhiệt độ, hoặc click vào MQ2 kéo tăng lượng khói), giao diện Web sẽ cập nhật chính xác góc xoay, nhiệt độ, biểu đồ chạy vèo vèo theo thời gian thực!

---

Chúc bạn có một buổi thuyết trình Thực tập IoT đạt điểm tuyệt đối 10/10! Cần điều chỉnh hay tối ưu gì thêm bạn cứ bảo mình nhé! 🚀🔥
