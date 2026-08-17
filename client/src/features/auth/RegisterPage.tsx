import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, ArrowLeft, Building2, Globe, Phone, Briefcase, Mail, CheckCircle } from 'lucide-react';

type Step = 'form' | 'otp' | 'success';

const RegisterPage: React.FC = () => {
    const [step, setStep] = useState<Step>('form');
    const [companyName, setCompanyName] = useState('');
    const [website, setWebsite] = useState('');
    const [phone, setPhone] = useState('');
    const [industry, setIndustry] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { register, verifyRegistrationOtp, resendRegistrationOtp, isLoading } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startResendCooldown = () => {
        setResendCooldown(30);
        timerRef.current = setInterval(() => {
            setResendCooldown((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleResendOtp = async () => {
        try {
            await resendRegistrationOtp(email);
            startResendCooldown();
            setError('');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await register({ name, email, password, companyName, website, phone, industry });
            setStep('otp');
            startResendCooldown();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await verifyRegistrationOtp(email, otp);
            setStep('success');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleBack = () => {
        if (step === 'otp') {
            setStep('form');
            setError('');
            setOtp('');
        } else {
            navigate('/');
        }
    };

    if (step === 'success') {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg)',
                padding: 24,
            }}>
                <div className="animate-fade-in" style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
                    <div style={{ color: 'var(--color-success)', marginBottom: 16 }}>
                        <CheckCircle size={56} style={{ margin: '0 auto' }} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Workspace Created!</h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 24 }}>
                        Your company and admin account are ready.
                    </p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '10px 16px', fontSize: '0.875rem' }}
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg)',
            padding: window.innerWidth < 768 ? 16 : 24,
            position: 'relative'
        }}>
            <button
                onClick={handleBack}
                className="btn btn-ghost"
                style={{
                    position: 'absolute',
                    top: 24,
                    left: 24,
                    gap: 8,
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500
                }}
            >
                <ArrowLeft size={18} /> {step === 'otp' ? 'Back to Form' : 'Back'}
            </button>

            <div className="animate-fade-in" style={{ width: '100%', maxWidth: 440 }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                    }} className='overflow-hidden'>
                        <img src="/icon.ico" alt="FlowDesk logo" className='rounded-xl scale-125' />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        {step === 'form' ? 'Create Your Workspace' : 'Verify Your Email'}
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
                        {step === 'form'
                            ? 'Set up your company and admin account'
                            : `We've sent a 6-digit code to ${email}`}
                    </p>
                </div>

                <div className="card" style={{ padding: 32 }}>
                    {error && (
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: 'var(--color-danger-light)',
                            color: 'var(--color-danger)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            marginBottom: 20
                        }}>
                            {error}
                        </div>
                    )}

                    {step === 'form' && (
                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    Company Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        placeholder="Your Company Inc."
                                        required
                                        autoFocus
                                        style={{ paddingLeft: 36 }}
                                    />
                                    <Building2 size={16} style={{
                                        position: 'absolute', left: 10, top: '50%',
                                        transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)',
                                        pointerEvents: 'none'
                                    }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                        Website
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="url"
                                            className="input"
                                            value={website}
                                            onChange={(e) => setWebsite(e.target.value)}
                                            placeholder="https://example.com"
                                            style={{ paddingLeft: 36 }}
                                        />
                                        <Globe size={16} style={{
                                            position: 'absolute', left: 10, top: '50%',
                                            transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)',
                                            pointerEvents: 'none'
                                        }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                        Phone
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="tel"
                                            className="input"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+1 234 567 890"
                                            style={{ paddingLeft: 36 }}
                                        />
                                        <Phone size={16} style={{
                                            position: 'absolute', left: 10, top: '50%',
                                            transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)',
                                            pointerEvents: 'none'
                                        }} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    Industry
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        value={industry}
                                        onChange={(e) => setIndustry(e.target.value)}
                                        placeholder="e.g. Technology, Finance, Healthcare"
                                        style={{ paddingLeft: 36 }}
                                    />
                                    <Briefcase size={16} style={{
                                        position: 'absolute', left: 10, top: '50%',
                                        transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)',
                                        pointerEvents: 'none'
                                    }} />
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    Your Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="John Doe"
                                    required
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    Email address <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="email"
                                        className="input"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="admin@company.com"
                                        required
                                        style={{ paddingLeft: 36 }}
                                    />
                                    <Mail size={16} style={{
                                        position: 'absolute', left: 10, top: '50%',
                                        transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)',
                                        pointerEvents: 'none'
                                    }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        className="input"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Min. 6 characters"
                                        required
                                        minLength={6}
                                        style={{ paddingRight: 40 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPw(!showPw)}
                                        style={{
                                            position: 'absolute', right: 8, top: '50%',
                                            transform: 'translateY(-50%)', background: 'none',
                                            border: 'none', cursor: 'pointer', padding: 4,
                                            color: 'var(--color-text-tertiary)',
                                        }}
                                    >
                                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isLoading}
                                style={{ width: '100%', padding: '10px 16px', fontSize: '0.875rem', marginTop: 4 }}
                            >
                                {isLoading ? 'Sending verification...' : 'Send Verification Code'}
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                Enter the 6-digit verification code sent to <strong>{email}</strong>.
                            </p>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                    6-Digit Code
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    required
                                    autoFocus
                                    style={{ letterSpacing: '8px', textAlign: 'center', fontSize: '1.25rem', fontWeight: 600 }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isLoading || otp.length !== 6}
                                style={{ width: '100%', padding: '10px 16px', fontSize: '0.875rem', marginTop: 4 }}
                            >
                                {isLoading ? 'Verifying...' : 'Verify & Create Workspace'}
                            </button>

                            <div style={{ textAlign: 'center', marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={handleResendOtp}
                                    disabled={resendCooldown > 0}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                                        fontSize: '0.8125rem',
                                        color: resendCooldown > 0 ? 'var(--color-text-tertiary)' : 'var(--color-primary)',
                                        fontWeight: 500,
                                        padding: 0,
                                    }}
                                >
                                    {resendCooldown > 0
                                        ? `Resend code in ${resendCooldown}s`
                                        : 'Resend verification code'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    Already have a workspace?{' '}
                    <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500, textDecoration: 'none' }}>
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;