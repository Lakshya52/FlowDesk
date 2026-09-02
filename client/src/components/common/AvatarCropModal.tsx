import React, { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import Modal from './Modal';

interface AvatarCropModalProps {
    open: boolean;
    imageUrl: string | null;
    onCancel: () => void;
    onConfirm: (file: File) => void;
}

const OUTPUT_SIZE = 512;

const getCroppedFile = (imageSrc: string, pixelCrop: Area): Promise<File> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = imageSrc;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const size = OUTPUT_SIZE;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas not supported'));

            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                size,
                size
            );

            canvas.toBlob(
                (blob) => {
                    if (!blob) return reject(new Error('Failed to create image'));
                    resolve(new File([blob], 'cropped-avatar.png', { type: 'image/png' }));
                },
                'image/png',
                1
            );
        };
        image.onerror = () => reject(new Error('Failed to load image'));
    });
};

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ open, imageUrl, onCancel, onConfirm }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (open) {
            setCrop({ x: 0, y: 0 });
            setZoom(1);
            setCroppedAreaPixels(null);
            setProcessing(false);
        }
    }, [open]);

    const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleConfirm = async () => {
        if (!imageUrl || !croppedAreaPixels) return;
        setProcessing(true);
        try {
            const file = await getCroppedFile(imageUrl, croppedAreaPixels);
            onConfirm(file);
        } catch (err) {
            console.error(err);
            alert('Failed to crop image. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Modal isOpen={open} onClose={onCancel} zIndex={3010}>
            <div
                style={{
                    width: 'min(92vw, 440px)',
                    background: 'var(--color-surface)',
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
            >
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>
                    Crop your profile picture
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                    Drag to reposition and use the slider to zoom. The final picture will be square.
                </p>

                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: 320,
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#000',
                    }}
                >
                    {imageUrl && (
                        <Cropper
                            image={imageUrl}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Zoom</span>
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        style={{ flex: 1 }}
                        aria-label="Zoom"
                    />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={processing}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleConfirm}
                        disabled={processing || !croppedAreaPixels}
                    >
                        {processing ? 'Cropping...' : 'Apply'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AvatarCropModal;
