import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score
import pickle
import os

def train_gesture_model():
    """Train a Random Forest model for gesture classification"""
    
    DATA_FILE = 'gesture_data.csv'
    MODEL_FILE = 'gesture_model.pkl'
    ENCODER_FILE = 'label_encoder.pkl'
    
    # Check if data file exists
    if not os.path.exists(DATA_FILE):
        print("Error: No training data found. Please collect data first.")
        return False
    
    try:
        # Load data
        print("Loading training data...")
        df = pd.read_csv(DATA_FILE)
        
        if len(df) < 10:
            print("Error: Not enough training data. Need at least 10 samples.")
            return False
        
        # Check for multiple gesture types
        unique_gestures = df['gesture'].nunique()
        if unique_gestures < 2:
            print(f"Error: Need at least 2 different gesture types for training, have {unique_gestures}.")
            return False
        
        print(f"Loaded {len(df)} samples")
        print("Gesture distribution:")
        print(df['gesture'].value_counts())
        
        # Prepare features and labels
        features = ['thumb', 'index', 'middle', 'ring', 'pinky']
        
        # Check if all required columns exist
        missing_cols = [col for col in features if col not in df.columns]
        if missing_cols:
            print(f"Error: Missing columns in data: {missing_cols}")
            return False
            
        X = df[features].values
        y = df['gesture'].values
        
        # Check for any NaN values
        if pd.isna(X).any() or pd.isna(y).any():
            print("Error: Data contains NaN values")
            return False
        
        # Encode labels
        label_encoder = LabelEncoder()
        y_encoded = label_encoder.fit_transform(y)
        
        # Split data
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
            )
        except ValueError as e:
            # If stratification fails, try without it
            print(f"Stratification failed: {e}. Trying without stratification...")
            X_train, X_test, y_train, y_test = train_test_split(
                X, y_encoded, test_size=0.2, random_state=42
            )
        
        print(f"Training set size: {len(X_train)}")
        print(f"Test set size: {len(X_test)}")
        
        # Train Random Forest model
        print("Training Random Forest model...")
        model = RandomForestClassifier(
            n_estimators=100,
            random_state=42,
            max_depth=10,
            min_samples_split=2,
            min_samples_leaf=1
        )
        
        model.fit(X_train, y_train)
        
        # Evaluate model
        y_pred = model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        
        print(f"\nModel Accuracy: {accuracy:.3f}")
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, 
                                  target_names=label_encoder.classes_))
        
        # Feature importance
        print("\nFeature Importance:")
        for i, feature in enumerate(features):
            print(f"{feature}: {model.feature_importances_[i]:.3f}")
        
        # Save model and encoder
        print("\nSaving model...")
        with open(MODEL_FILE, 'wb') as f:
            pickle.dump(model, f)
        
        with open(ENCODER_FILE, 'wb') as f:
            pickle.dump(label_encoder, f)
        
        print("Model saved successfully!")
        print(f"Model file: {MODEL_FILE}")
        print(f"Encoder file: {ENCODER_FILE}")
        
        return True
        
    except Exception as e:
        print(f"Error during training: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("GestureEcho Model Training")
    print("=" * 30)
    
    success = train_gesture_model()
    
    if success:
        print("\n✅ Training completed successfully!")
    else:
        print("\n❌ Training failed!")