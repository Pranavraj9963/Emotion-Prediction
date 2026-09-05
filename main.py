from fastapi import FastAPI,HTTPException
from fastapi.staticfiles import StaticFiles
import re
from pydantic import BaseModel,Field
from keras.models import load_model
import pickle
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.preprocessing.text import Tokenizer
import numpy as np

                                                         

model_path ="Artifacts/BiGRU_Model.keras"
    
tokenizer_path = "Artifacts/tokenizer.pkl"

max_sequence_length = 50

emotion_labels = ['sadness','joy','love','anger','fear','surprise']

EMOTION_EMOJIS = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😲",
}

def preprocess_text(text:str)->str:
    text = text.lower()
    text = re.sub(r"'","",text)
    text = re.sub(r"[^a-z0-9\s]"," ",text)
    text = re.sub(r"\s+", " ",text).strip()
    return text


class TextInput(BaseModel):
    text : str = Field(...,min_length=1,
                       max_length=2000,
                       description="The sentence to analyze",
                       json_schema_extra = {"exampe":"I feel so happy and excited"}
                       )
    


class PrdictionResponse(BaseModel):
    text : str
    predicted_emotion : str
    confidence : float
    all_probabilities : dict[str,float]


class HealthResponse(BaseModel):
    status: str
    model_loaded :bool

dl_model = {}
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading the model and tokenizer...")
    dl_model["BiGRU"] = load_model(model_path,compile = False)
    
    with open(tokenizer_path,'rb') as file:
        dl_model["Tokenizer"] = pickle.load(file)
    print('Model are loaded successfully...')
    yield 
    dl_model.clear()

app = FastAPI(lifespan = lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount('/static',StaticFiles(directory="static"),name="static")

@app.get('/',include_in_schema= False)
def server_ui():
    return FileResponse('static/index.html')



@app.get('/health',response_model=HealthResponse)
def health_check():
        return HealthResponse(status="server is running",model_loaded =bool(dl_model) )    



@app.post('/predict',response_model = PrdictionResponse)
def predict_emotion(text_input:TextInput):
     
     BiGRU_model = dl_model.get("BiGRU")
     tokenizer_model = dl_model.get("Tokenizer")

     if BiGRU_model is None or tokenizer_model is None:
          raise HTTPException(status_code=503,detail= "Model is nit loaded yet. Please try again later.")

     cleaned_test = preprocess_text(text_input.text)

     tokenized_text = tokenizer_model.texts_to_sequences([cleaned_test])

     padded_sequences = pad_sequences(tokenized_text,
                                      maxlen = max_sequence_length,
                                      padding ="post" )


     probabilities = BiGRU_model.predict(padded_sequences)[0]
     top_emotion_index = int(np.argmax(probabilities))
     all_probabilities = {
          label :float(prob) for prob ,label in zip(probabilities,emotion_labels)
     }

     return PrdictionResponse(
          text = text_input.text,
          predicted_emotion = emotion_labels[top_emotion_index],
          confidence=float(probabilities[top_emotion_index]),
          all_probabilities= all_probabilities
     )