import os
import cv2
from ultralytics import YOLO

class UAVDetector:
    def __init__(self, model_path, imgsz=1280, conf=0.25, device='0'):
        """
        Initializes the YOLO26s detector.
        Loads the model once on startup and sets inference parameters.
        """
        self.model_path = model_path
        self.imgsz = imgsz
        self.conf = conf
        self.device = device
        
        # Verify model exists before loading
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model weight file not found at: {model_path}")
            
        self.model = YOLO(model_path)
        
    def detect(self, image_path, output_annotated_path=None):
        """
        Runs inference on the input image using GPU (or configured device).
        Returns:
            - list of detections (sorted by confidence descending)
            - original image width
            - original image height
        """
        # Run inference
        results = self.model(
            image_path,
            imgsz=self.imgsz,
            conf=self.conf,
            device=self.device
        )
        
        result = results[0]
        boxes = result.boxes
        orig_h, orig_w = result.orig_shape
        
        detections = []
        if boxes is not None:
            for box in boxes:
                # coords in xyxy
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = xyxy
                conf_val = float(box.conf[0].item())
                cls_id = int(box.cls[0].item())
                cls_name = result.names[cls_id] if cls_id in result.names else 'drone'
                
                w = x2 - x1
                h = y2 - y1
                cx = x1 + w / 2
                cy = y1 + h / 2
                
                detections.append({
                    'x1': round(x1, 1),
                    'y1': round(y1, 1),
                    'x2': round(x2, 1),
                    'y2': round(y2, 1),
                    'width': round(w, 1),
                    'height': round(h, 1),
                    'center_x': round(cx, 1),
                    'center_y': round(cy, 1),
                    'confidence': round(conf_val, 4),
                    'class_id': cls_id,
                    'class_name': cls_name
                })
        
        # Sort detections by confidence descending
        detections.sort(key=lambda d: d['confidence'], reverse=True)
        
        # Save annotated image
        if output_annotated_path:
            img = cv2.imread(image_path)
            
            # Premium technical cyan/blue color BGR (235, 140, 0)
            color = (235, 140, 0) 
            
            for idx, det in enumerate(detections):
                x1, y1, x2, y2 = int(det['x1']), int(det['y1']), int(det['x2']), int(det['y2'])
                conf_percent = int(det['confidence'] * 100)
                
                # Draw main rectangle
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                
                # Text content
                text = f"#{idx+1} ({conf_percent}%)"
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.35
                thickness = 1
                
                # Get text size
                (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)
                
                # Draw label background adjusting for top clipping
                label_y = max(y1, text_h + 6)
                cv2.rectangle(img, (x1, label_y - text_h - 4), (x1 + text_w + 4, label_y), color, -1)
                
                # Draw white text
                cv2.putText(img, text, (x1 + 2, label_y - 2), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
            
            # Save final file
            cv2.imwrite(output_annotated_path, img)
            
        return detections, orig_w, orig_h
