import os

# Model path config
MODEL_PATH = os.environ.get(
    'MODEL_PATH', 
    '/mnt/ssd4tb/swarm_detection/runs/uavswarm_yolo26s_1280_100ep/weights/best.pt'
)

# Inference settings
IMG_SIZE = int(os.environ.get('IMG_SIZE', 1280))
CONF_THRESHOLD = float(os.environ.get('CONF_THRESHOLD', 0.25))
DEVICE = os.environ.get('DEVICE', '0')

# Swarm logic settings
SWARM_THRESHOLD = int(os.environ.get('SWARM_THRESHOLD', 10))

# Ollama LLM Settings
OLLAMA_HOST = os.environ.get('OLLAMA_HOST', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3:latest')
OLLAMA_TIMEOUT = int(os.environ.get('OLLAMA_TIMEOUT', 30))

# Web application settings
MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', 10))

# Directory paths relative to application directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
OUTPUT_FOLDER = os.environ.get('OUTPUT_FOLDER', os.path.join(BASE_DIR, 'static', 'outputs'))

# Allowed image file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
