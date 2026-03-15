from google.cloud import texttospeech, storage
from google.oauth2 import service_account
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv

base_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=base_dir / ".env")

keyfile = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if keyfile and not os.path.isabs(keyfile):
    keyfile = str(base_dir / keyfile)
if keyfile:
    credentials = service_account.Credentials.from_service_account_file(keyfile)
    tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
    storage_client = storage.Client(credentials=credentials, project=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    print(f"[TTS] Using service account key: {keyfile}")
else:
    tts_client = texttospeech.TextToSpeechClient()
    storage_client = storage.Client()
    print("[TTS] Using default application credentials")

BUCKET = os.environ["GCS_BUCKET"]


def upload_image_to_gcs(data: bytes, mime_type: str) -> str:
    """Upload raw image bytes to GCS and return public URL."""
    ext = mime_type.split("/")[-1] if "/" in mime_type else "png"
    filename = f"images/{uuid.uuid4()}.{ext}"
    bucket = storage_client.bucket(BUCKET)
    blob = bucket.blob(filename)
    blob.upload_from_string(data, content_type=mime_type)
    return f"https://storage.googleapis.com/{BUCKET}/{filename}"


def text_to_audio_url(text: str) -> str:
    """Convert text to WaveNet audio, upload to GCS, return public URL."""
    # Truncate to 4900 bytes (API limit is 5000 bytes, not characters)
    encoded = text.encode("utf-8")[:4900]
    truncated = encoded.decode("utf-8", errors="ignore")
    synthesis_input = texttospeech.SynthesisInput(text=truncated)
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        name="en-US-Neural2-D",  # Neural2 — more natural, expressive narration
        ssml_gender=texttospeech.SsmlVoiceGender.MALE,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    response = tts_client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )

    filename = f"audio/{uuid.uuid4()}.mp3"
    bucket = storage_client.bucket(BUCKET)
    blob = bucket.blob(filename)
    blob.upload_from_string(response.audio_content, content_type="audio/mpeg")

    return f"https://storage.googleapis.com/{BUCKET}/{filename}"
