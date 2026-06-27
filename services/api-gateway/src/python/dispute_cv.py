import io
import hashlib
import ipaddress
import urllib.parse
import requests
import numpy as np
import cv2
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from skimage.metrics import structural_similarity as ssim
from PIL import Image

import torch
import torchvision.models as models
import torchvision.transforms as transforms
import torch.nn.functional as F

torch.set_num_threads(2)
torch.set_num_interop_threads(1)

app = Flask(__name__)

ALLOWED_DOMAINS    = ['res.cloudinary.com', 'cloudinary.com']
EXIF_DATETIME_ORIG = 36867

# ── MobileNet lazy load ───────────────────────────────────────────────────────
# loads ONLY when first /compare is called — zero fan noise on startup
_mb_extractor = None
_mb_transform = None

def _load_model():
    global _mb_extractor, _mb_transform
    if _mb_extractor is not None:
        return
    print('[dispute_cv] loading MobileNetV2 weights…')
    weights       = models.MobileNet_V2_Weights.DEFAULT
    model         = models.mobilenet_v2(weights=weights)
    _mb_extractor = torch.nn.Sequential(
        model.features,
        torch.nn.AdaptiveAvgPool2d((1, 1)),
        torch.nn.Flatten()
    )
    _mb_extractor.eval()
    _mb_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std =[0.229, 0.224, 0.225]),
    ])
    print('[dispute_cv] MobileNetV2 ready')

def get_embedding(img_bgr):
    _load_model()
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    tensor  = _mb_transform(pil_img).unsqueeze(0)
    with torch.no_grad():
        emb = _mb_extractor(tensor)
    return F.normalize(emb, p=2, dim=1)

# ── Helpers ───────────────────────────────────────────────────────────────────
def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError):
        return None

# ── URL validation ────────────────────────────────────────────────────────────
def validate_url(url):
    if not url:
        return
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https':
        raise ValueError(f'Only HTTPS URLs allowed: {url}')
    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f'Invalid URL: {url}')
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError(f'Internal IP not allowed: {hostname}')
    except ValueError as e:
        if 'not allowed' in str(e) or 'Internal' in str(e):
            raise
    if not any(hostname == d or hostname.endswith('.' + d) for d in ALLOWED_DOMAINS):
        raise ValueError(f'Domain not allowed: {hostname}. Must be Cloudinary URL.')

# ── Download pipeline ─────────────────────────────────────────────────────────
def download_bytes(url):
    validate_url(url)
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return resp.content

def decode_image(b):
    if b is None:
        return None
    arr = np.frombuffer(b, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

def download_image(url):
    return decode_image(download_bytes(url))

# ── EXIF extraction ───────────────────────────────────────────────────────────
def extract_exif_datetime(raw_bytes):
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        try:
            dt_str = img.getexif().get(EXIF_DATETIME_ORIG)
        except AttributeError:
            raw    = img._getexif()
            dt_str = raw.get(EXIF_DATETIME_ORIG) if raw else None
        if not dt_str:
            return None
        return datetime.strptime(str(dt_str), '%Y:%m:%d %H:%M:%S')
    except Exception:
        return None

# ── Timestamp validation ──────────────────────────────────────────────────────
HARD_TS_FLAGS = {
    'INVALID_SEQUENCE_BEFORE_DURING',
    'INVALID_SEQUENCE_DURING_AFTER',
    'IDENTICAL_EXIF_TIMESTAMPS',
    'FUTURE_DATED_EXIF_BEFORE',
    'FUTURE_DATED_EXIF_DURING',
    'FUTURE_DATED_EXIF_AFTER',
}

def validate_timestamps(photo_bytes, uploaded_at, delivery_start, delivery_end, tolerance_minutes=30):
    flags  = []
    issues = []
    now    = datetime.utcnow()
    tol    = timedelta(minutes=tolerance_minutes)

    exif_times = {
        stage: extract_exif_datetime(b)
        for stage, b in photo_bytes.items()
        if b is not None
    }

    for stage, b in photo_bytes.items():
        if b is not None and exif_times.get(stage) is None:
            issues.append(f'{stage.upper()} photo has no EXIF timestamp — stripped by CDN or deliberately removed')
            flags.append(f'EXIF_MISSING_{stage.upper()}')

    for stage, dt in exif_times.items():
        if dt and dt > now + timedelta(hours=1):
            issues.append(f'{stage.upper()} EXIF dated in the future ({dt.isoformat()}) — possible clock manipulation')
            flags.append(f'FUTURE_DATED_EXIF_{stage.upper()}')

    if delivery_start and delivery_end:
        for stage, dt in exif_times.items():
            if dt:
                if dt < delivery_start - tol:
                    delta_min = int((delivery_start - dt).total_seconds() / 60)
                    issues.append(f'{stage.upper()} photo taken {delta_min} min before delivery window — possible pre-taken photo')
                    flags.append(f'PHOTO_PREDATES_WINDOW_{stage.upper()}')
                elif dt > delivery_end + tol:
                    delta_min = int((dt - delivery_end).total_seconds() / 60)
                    issues.append(f'{stage.upper()} photo taken {delta_min} min after delivery window closed')
                    flags.append(f'PHOTO_AFTER_WINDOW_{stage.upper()}')

    b_dt = exif_times.get('before')
    d_dt = exif_times.get('during')
    a_dt = exif_times.get('after')

    if b_dt and d_dt and b_dt > d_dt + tol:
        issues.append(f'BEFORE EXIF ({b_dt.isoformat()}) newer than DURING ({d_dt.isoformat()}) — impossible sequence')
        flags.append('INVALID_SEQUENCE_BEFORE_DURING')
    if d_dt and a_dt and d_dt > a_dt + tol:
        issues.append(f'DURING EXIF ({d_dt.isoformat()}) newer than AFTER ({a_dt.isoformat()}) — impossible sequence')
        flags.append('INVALID_SEQUENCE_DURING_AFTER')

    exif_vals = [dt for dt in exif_times.values() if dt is not None]
    if len(exif_vals) >= 2 and len(set(dt.isoformat() for dt in exif_vals)) == 1:
        issues.append('All photos share identical EXIF timestamp — same photo likely reused across stages')
        flags.append('IDENTICAL_EXIF_TIMESTAMPS')

    if delivery_start:
        for stage, upload_dt in uploaded_at.items():
            if upload_dt and upload_dt < delivery_start - tol:
                delta_min = int((delivery_start - upload_dt).total_seconds() / 60)
                issues.append(f'{stage.upper()} uploaded {delta_min} min before delivery window opened — suspicious')
                flags.append(f'EARLY_UPLOAD_{stage.upper()}')

    for stage, exif_dt in exif_times.items():
        upload_dt = uploaded_at.get(stage)
        if exif_dt and upload_dt:
            gap_hours = abs((upload_dt - exif_dt).total_seconds()) / 3600
            if gap_hours > 24:
                issues.append(f'{stage.upper()} EXIF is {gap_hours:.1f}h before upload — possible reused photo')
                flags.append(f'STALE_PHOTO_{stage.upper()}')

    return { 'flags': flags, 'issues': issues }

# ── Image comparison ──────────────────────────────────────────────────────────
def compare_images(img1, img2):
    if img1 is None or img2 is None:
        return 0.0

    # MobileNet — handles angle/lighting variance (60%)
    e1           = get_embedding(img1)
    e2           = get_embedding(img2)
    score_mobile = max(0.0, F.cosine_similarity(e1, e2).item()) * 100

    # SSIM — structural integrity check (40%)
    h, w  = 512, 512
    img1r = cv2.resize(img1, (w, h))
    img2r = cv2.resize(img2, (w, h))
    gray1 = cv2.cvtColor(img1r, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2r, cv2.COLOR_BGR2GRAY)
    score_ssim, _ = ssim(gray1, gray2, full=True)
    score_ssim    = max(0.0, score_ssim) * 100

    return round((score_mobile * 0.60) + (score_ssim * 0.40), 2)

# ── Verdict logic ─────────────────────────────────────────────────────────────
def detect_issues(before, during, after=None):
    issues = []
    flags  = []

    before_during = compare_images(before, during) if before is not None and during is not None else None
    before_after  = compare_images(before, after)  if before is not None and after  is not None else None
    during_after  = compare_images(during, after)  if during is not None and after  is not None else None

    verdict    = None
    confidence = None

    if during is None:
        issues.append('DURING photo missing — delivery guy never arrived or avoided documentation')
        flags.append('MISSING_DURING_PHOTO')
        verdict    = 'DELIVERY_GUY_FAULT'
        confidence = 95.0
    elif before_during is not None:
        if before_during > 95:
            issues.append('Photos match well — no tampering detected. Human review required.')
            verdict    = 'PENDING_ADMIN'
            confidence = before_during
        elif before_during < 90:
            issues.append(f'Significant difference between BEFORE and DURING ({before_during}%) — possible tampering')
            flags.append('TAMPERING_DETECTED')
            verdict    = 'DELIVERY_GUY_FAULT'
            confidence = round(100 - before_during, 2)
        else:
            issues.append(f'Unclear match ({before_during}%) — requires admin review')
            flags.append('UNCLEAR_MATCH')
            verdict    = 'PENDING_ADMIN'
            confidence = before_during

    # after photo check — escalates if damage found and not already DELIVERY_GUY_FAULT
    if after is not None and before_after is not None:
        if before_after < 90:
            issues.append(f'AFTER photo differs significantly from BEFORE ({before_after}%) — item may have been damaged after delivery')
            flags.append('AFTER_DIFFERS_FROM_BEFORE')
            if verdict != 'DELIVERY_GUY_FAULT':
                verdict    = 'DELIVERY_GUY_FAULT'
                confidence = round(100 - before_after, 2)

    return {
        'verdict':    verdict,
        'confidence': confidence,
        'scores': {
            'before_vs_during': before_during,
            'before_vs_after':  before_after,
            'during_vs_after':  during_after,
        },
        'issues': issues,
        'flags':  flags,
    }

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/compare', methods=['POST'])
def compare():
    try:
        data       = request.json
        before_url = data.get('beforeUrl')
        during_url = data.get('duringUrl')
        after_url  = data.get('afterUrl')

        if not before_url:
            return jsonify({ 'error': 'beforeUrl is required' }), 400

        delivery_start = parse_dt(data.get('deliveryWindowStart'))
        delivery_end   = parse_dt(data.get('deliveryWindowEnd'))
        uploaded_raw   = data.get('uploadedAt') or {}
        uploaded_at    = {
            'before': parse_dt(uploaded_raw.get('before')),
            'during': parse_dt(uploaded_raw.get('during')),
            'after':  parse_dt(uploaded_raw.get('after')),
        }

        before_bytes = download_bytes(before_url)
        during_bytes = download_bytes(during_url) if during_url else None
        after_bytes  = download_bytes(after_url)  if after_url  else None

        all_hashes     = [hashlib.md5(b).hexdigest() for b in [before_bytes, during_bytes, after_bytes] if b]
        duplicate_flag = len(all_hashes) != len(set(all_hashes))

        before = decode_image(before_bytes)
        during = decode_image(during_bytes)
        after  = decode_image(after_bytes)

        result = detect_issues(before, during, after)

        if duplicate_flag:
            result['flags'].append('DUPLICATE_IMAGES_DETECTED')
            result['issues'].append('Identical images detected — possible fraud or photo reuse')
            result['verdict'] = 'PENDING_ADMIN'

        ts = validate_timestamps(
            photo_bytes    = { 'before': before_bytes, 'during': during_bytes, 'after': after_bytes },
            uploaded_at    = uploaded_at,
            delivery_start = delivery_start,
            delivery_end   = delivery_end,
        )
        result['flags'].extend(ts['flags'])
        result['issues'].extend(ts['issues'])

        if any(f in result['flags'] for f in HARD_TS_FLAGS):
            result['verdict'] = 'PENDING_ADMIN'
            result['issues'].append('Hard timestamp fraud signal — escalated to admin review')

        return jsonify({ 'success': True, **result })

    except Exception as e:
        return jsonify({ 'success': False, 'error': str(e) }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({ 'status': 'ok' })

@app.route('/ready', methods=['GET'])
def ready():
    try:
        dummy     = np.zeros((224, 224, 3), dtype=np.uint8)
        embedding = get_embedding(dummy)
        return jsonify({
            'status':    'ready',
            'model':     'MobileNetV2',
            'emb_shape': list(embedding.shape),
        })
    except Exception as e:
        return jsonify({ 'status': 'error', 'detail': str(e) }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
