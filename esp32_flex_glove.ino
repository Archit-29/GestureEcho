/*
 * GestureEcho - ESP32 Flex Sensor Glove
 * Reads 5 flex sensors and sends data via Wi-Fi
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Wi-Fi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server endpoint
const char* serverURL = "http://192.168.1.100:5000/sensor_data";

// Flex sensor pins (analog pins)
const int flexPins[5] = {34, 35, 32, 33, 25}; // GPIO pins for 5 flex sensors
const char* fingerNames[5] = {"thumb", "index", "middle", "ring", "pinky"};

// Calibration values (adjust based on your sensors)
const int flexMin[5] = {200, 200, 200, 200, 200}; // Minimum sensor values (straight)
const int flexMax[5] = {800, 800, 800, 800, 800}; // Maximum sensor values (fully bent)

void setup() {
  Serial.begin(115200);
  
  // Initialize analog pins
  for(int i = 0; i < 5; i++) {
    pinMode(flexPins[i], INPUT);
  }
  
  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Read flex sensor values
    int flexValues[5];
    float normalizedValues[5];
    
    for(int i = 0; i < 5; i++) {
      flexValues[i] = analogRead(flexPins[i]);
      // Normalize to 0-1 range
      normalizedValues[i] = (float)(flexValues[i] - flexMin[i]) / (flexMax[i] - flexMin[i]);
      normalizedValues[i] = constrain(normalizedValues[i], 0.0, 1.0);
    }
    
    // Create JSON payload
    DynamicJsonDocument doc(200);
    doc["thumb"] = normalizedValues[0];
    doc["index"] = normalizedValues[1];
    doc["middle"] = normalizedValues[2];
    doc["ring"] = normalizedValues[3];
    doc["pinky"] = normalizedValues[4];
    doc["timestamp"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send HTTP POST request
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Response: " + response);
    } else {
      Serial.printf("Error: %d\n", httpResponseCode);
    }
    
    http.end();
    
    // Print sensor values to serial for debugging
    Serial.print("Flex Values: ");
    for(int i = 0; i < 5; i++) {
      Serial.printf("%s:%.2f ", fingerNames[i], normalizedValues[i]);
    }
    Serial.println();
  }
  
  delay(500); // Send data every 500ms
}