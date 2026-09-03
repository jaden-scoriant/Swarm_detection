import os
import sys
import urllib.request
import json
import config
from config import ALLOWED_EXTENSIONS

def allowed_file(filename):
    """
    Checks if a given filename has a supported image extension.
    """
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_ollama_status():
    """
    Checks if Ollama service is reachable and if the target model is available.
    """
    status = {
        'reachable': False,
        'model': config.OLLAMA_MODEL,
        'host': config.OLLAMA_HOST,
        'model_ready': False
    }
    try:
        url = f"{config.OLLAMA_HOST.rstrip('/')}/api/tags"
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=1.5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                status['reachable'] = True
                models = [m.get('name', '') for m in data.get('models', [])]
                status['installed_models'] = models
                # Check if llama3 or specified model matches
                if any(config.OLLAMA_MODEL in m for m in models) or any('llama3' in m for m in models):
                    status['model_ready'] = True
    except Exception as e:
        status['error'] = str(e)
    return status

def get_system_status():
    """
    Detects GPU and CUDA status via PyTorch, alongside Ollama LLM readiness.
    """
    status = {
        'cuda_available': False,
        'gpu_name': 'N/A',
        'device_name': 'CPU',
        'torch_version': 'N/A',
        'ollama': get_ollama_status()
    }
    
    try:
        import torch
        status['torch_version'] = torch.__version__
        if torch.cuda.is_available():
            status['cuda_available'] = True
            status['gpu_name'] = torch.cuda.get_device_name(0)
            status['device_name'] = f"CUDA:0"
        else:
            status['device_name'] = 'CPU'
    except ImportError:
        status['torch_version'] = 'Torch not installed'
    except Exception as e:
        status['error'] = str(e)
        
    return status
