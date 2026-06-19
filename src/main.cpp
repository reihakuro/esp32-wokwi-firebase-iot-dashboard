#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ================= CẤU HÌNH CHÂN (PINS) =================
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ2_PIN 34
#define LED_PIN 5
#define STEP_PIN 27
#define DIR_PIN 26

// ================= CẤU HÌNH WIFI & FIREBASE =================
#define WIFI_SSID "Wokwi-GUEST" 
#define WIFI_PASSWORD ""
const char* firebase_url = "https://iot-esp32-dashboard-default-rtdb.firebaseio.com/thiet_bi_1/du_lieu_hien_tai.json";

// ================= KHỞI TẠO ĐỐI TƯỢNG =================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;

// ================= CÁC BIẾN TRẠNG THÁI HỆ THỐNG =================
int ledState = 0;
String oledText = "";
int stepperRunning = 0;
String stepperDir = "CW";
int stepperSpeed = 0;
int stepperSteps = 0;

// ================= BIẾN THỜI GIAN (MULTITASKING) =================
unsigned long lastFirebaseSync = 0;
unsigned long lastStepTime = 0;

void setup() {
  Serial.begin(115200);

  // 1. Cấu hình chân Động cơ & LED
  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 2. Kết nối WiFi
  Serial.print("Đang kết nối WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nĐã kết nối WiFi!");

  // 3. Khởi tạo I2C và màn hình OLED
  Wire.begin(21, 22); // Khởi tạo I2C với SDA=21, SCL=22
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("Lỗi: Không tìm thấy OLED SSD1306!");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("NEXUS SYSTEM");
    display.println("WiFi: Connected!");
    display.println("Ready for Web Sync!");
    display.display();
  }

  // 4. Khởi tạo Cảm biến
  dht.begin();
  if (!mpu.begin()) {
    Serial.println("Lỗi: Không tìm thấy MPU6050!");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  }
  
  Serial.println("Hệ thống đã khởi động hoàn tất!");
}

void loop() {
  // --- ĐỌC DỮ LIỆU CẢM BIẾN ---
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasRaw = analogRead(MQ2_PIN);
  
  sensors_event_t a, g, t_mpu;
  mpu.getEvent(&a, &g, &t_mpu);

  // --- NHIỆM VỤ 1: ĐỒNG BỘ DỮ LIỆU VỚI FIREBASE (Mỗi 2 giây) ---
  if (millis() - lastFirebaseSync > 2000) {
    lastFirebaseSync = millis();
    
    if (WiFi.status() == WL_CONNECTED) {
      // 1. GỬI DỮ LIỆU CẢM BIẾN (PUT)
      // Tính toán Roll, Pitch từ gia tốc thực tế của MPU6050
      float roll = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / M_PI;
      float pitch = atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 180.0 / M_PI;
      float yaw = g.gyro.z * 180.0 / M_PI; // Tốc độ góc hoặc góc tương đối

      String jsonString = "{";
      
      // DHT22 Node
      jsonString += "\"dht22\":{";
      jsonString += "\"temperature\":" + String(isnan(temp) ? 25.0 : temp) + ",";
      jsonString += "\"humidity\":" + String(isnan(hum) ? 50.0 : hum);
      jsonString += "},";
      
      // MQ2 Node
      jsonString += "\"mq2\":{";
      jsonString += "\"gas\":" + String(gasRaw);
      jsonString += "},";
      
      // MPU6050 Node
      jsonString += "\"mpu6050\":{";
      jsonString += "\"acc_x\":" + String(a.acceleration.x / 9.8) + ",";
      jsonString += "\"acc_y\":" + String(a.acceleration.y / 9.8) + ",";
      jsonString += "\"acc_z\":" + String(a.acceleration.z / 9.8) + ",";
      jsonString += "\"roll\":" + String(roll) + ",";
      jsonString += "\"pitch\":" + String(pitch) + ",";
      jsonString += "\"yaw\":" + String(yaw);
      jsonString += "}";
      
      jsonString += "}";

      HTTPClient http;
      
      // PATCH dữ liệu cảm biến lên Firebase (để không xóa mất các nút điều khiển LED, OLED, Stepper)
      http.begin(firebase_url);
      http.addHeader("Content-Type", "application/json");
      int httpResponseCode = http.PATCH(jsonString);
      if (httpResponseCode > 0) {
        Serial.println("-> Cập nhật cảm biến thành công!");
      } else {
        Serial.printf("-> Lỗi gửi cảm biến: %d\n", httpResponseCode);
      }
      http.end();

      // 2. LẤY CÁC LỆNH ĐIỀU KHIỂN TỪ WEB VỀ (GET)
      http.begin(firebase_url);
      int getResponseCode = http.GET();
      if (getResponseCode == 200) {
        String payload = http.getString();
        
        // A. Đọc trạng thái LED
        int ledIndex = payload.indexOf("\"led\":");
        if (ledIndex != -1) {
          ledState = payload.substring(ledIndex + 6, ledIndex + 7).toInt();
          digitalWrite(LED_PIN, ledState);
        }

        // B. Đọc nội dung OLED Text gửi từ Web
        int oledIndex = payload.indexOf("\"text\":");
        if (oledIndex != -1) {
          int startQuote = payload.indexOf("\"", oledIndex + 7);
          int endQuote = payload.indexOf("\"", startQuote + 1);
          String rawOledText = payload.substring(startQuote + 1, endQuote);
          rawOledText.replace("\\n", "\n");
          
          if (rawOledText != oledText) {
            oledText = rawOledText;
            display.clearDisplay();
            display.setCursor(0, 0);
            display.print(oledText);
            display.display();
          }
        }

        // C. Đọc thông số Động cơ Stepper
        int runIndex = payload.indexOf("\"running\":");
        if (runIndex != -1) {
          stepperRunning = payload.substring(runIndex + 10, payload.indexOf(",", runIndex)).toInt();
        }
        int dirIndex = payload.indexOf("\"direction\":");
        if (dirIndex != -1) {
          int startQuote = payload.indexOf("\"", dirIndex + 12);
          int endQuote = payload.indexOf("\"", startQuote + 1);
          stepperDir = payload.substring(startQuote + 1, endQuote);
        }
        int speedIndex = payload.indexOf("\"speed\":");
        if (speedIndex != -1) {
          stepperSpeed = payload.substring(speedIndex + 8, payload.indexOf(",", speedIndex)).toInt();
        }
        int stepIndex = payload.indexOf("\"steps\":");
        if (stepIndex != -1) {
          stepperSteps = payload.substring(stepIndex + 8, payload.indexOf("}", stepIndex)).toInt();
        }
      }
      http.end();
    }
  }

  // --- NHIỆM VỤ 2: ĐIỀU KHIỂN ĐỘNG CƠ BƯỚC KHÔNG BỊ NGHẼN MẠNG (NON-BLOCKING) ---
  if (stepperRunning == 1 && stepperSpeed > 0) {
    if (stepperDir == "CW") {
      digitalWrite(DIR_PIN, HIGH);
    } else {
      digitalWrite(DIR_PIN, LOW);
    }
    
    // Ánh xạ tốc độ (1-100%) sang độ trễ xung micro giây (3000us xuống 500us)
    int microDelay = map(stepperSpeed, 1, 100, 3000, 500);
    
    // Tạo 1 xung bước
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(microDelay);
    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(microDelay);
    
    // Xử lý góc quay theo số bước cụ thể (nếu có)
    if (stepperSteps > 0) {
      stepperSteps--;
      if (stepperSteps <= 0) {
        stepperRunning = 0;
        stepperSpeed = 0;
        
        // Gửi tín hiệu dừng về Firebase để đồng bộ lại giao diện Web
        if (WiFi.status() == WL_CONNECTED) {
          HTTPClient http;
          String stopUrl = "https://iot-esp32-dashboard-default-rtdb.firebaseio.com/thiet_bi_1/du_lieu_hien_tai/stepper.json";
          http.begin(stopUrl);
          http.addHeader("Content-Type", "application/json");
          http.PATCH("{\"running\":0,\"speed\":0,\"steps\":0}");
          http.end();
        }
      }
    }
  }
}