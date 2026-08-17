import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle, BarChart3, Users, FolderKanban, ArrowRight, Plus, Minus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [activeFaq, setActiveFaq] = React.useState<number | null>(null);

    // Redirect to dashboard if already logged in
    React.useEffect(() => {
        if (user) {
            navigate('/dashboard');
        }
    }, [user, navigate]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'white',
            color: '#171717',
            fontFamily: "'Outfit', sans-serif"
        }}>
            {/* Google Fonts - Outfit */}
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .floating {
          animation: float 3s ease-in-out infinite;
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .glass-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 16px 48px 0 rgba(31, 38, 135, 0.12);
          border-color: rgba(99, 102, 241, 0.3);
        }
        
        .hero-gradient {
          background: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
                      radial-gradient(circle at 90% 80%, rgba(167, 139, 250, 0.05) 0%, transparent 50%);
        }

        .pricing-card-popular {
          border: 2px solid #6366f1 !important;
          position: relative;
        }

        .pricing-card-popular::before {
          content: 'MOST POPULAR';
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: #6366f1;
          color: white;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .faq-item {
          border-bottom: 1px solid #f0f0f0;
          transition: all 0.3s ease;
        }
        
        .faq-item:last-child {
          border-bottom: none;
        }
      `}</style>

            {/* Navigation */}
            <nav style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 5%',
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                borderBottom: '1px solid rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        // background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                    }}>
                        <img src="/icon.ico" alt="FlowDesk logo" className='rounded-xl scale-125' />
                        {/* <Zap size={20} color="white" /> */}
                    </div>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', background: 'linear-gradient(to right, #171717, #404040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FlowDesk</span>
                </div>

                <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
                    {/* <a href="#features" style={{ textDecoration: 'none', color: '#525252', fontSize: '0.9375rem', fontWeight: 500 }}>Features</a> */}
                    {/* <a href="#pricing" style={{ textDecoration: 'none', color: '#525252', fontSize: '0.9375rem', fontWeight: 500 }}>Pricing</a> */}
                    {/* <button
                        onClick={() => navigate('/login')}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#171717',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Login
                    </button> */}
                    <button
                        onClick={() => navigate('/login')}
                        className="btn btn-primary"
                        style={{ borderRadius: '100px', padding: '12px 28px', fontSize: '0.9375rem', fontWeight: 600, boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)' }}
                    >
                        Get Started
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-gradient" style={{
                padding: '40px 5% 100px',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ maxWidth: 850, margin: '0 auto', position: 'relative', zIndex: 1 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 20px',
                        borderRadius: '100px',
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: '#6366f1',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        marginBottom: 32,
                        letterSpacing: '0.02em',
                        border: '1px solid rgba(99, 102, 241, 0.15)'
                    }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 10px #6366f1' }}></span>
                        Built for high-performance teams
                    </div>

                    <h1 style={{
                        fontSize: 'clamp(2.8rem, 9vw, 5rem)',
                        fontWeight: 900,
                        lineHeight: 1.05,
                        letterSpacing: '-0.05em',
                        marginBottom: 32,
                        color: '#171717'
                    }}>
                        Your workflow, <br />
                        <span style={{
                            background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>perfectly synchronized.</span>
                    </h1>

                    <p style={{
                        fontSize: '1.25rem',
                        color: '#525252',
                        marginBottom: 48,
                        lineHeight: 1.6,
                        maxWidth: 650,
                        margin: '0 auto 48px'
                    }}>
                        FlowDesk is the unified workspace where strategy meets execution. Manage Projects, track tasks, and scale your team with precision.
                    </p>

                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as any }}>
                        <button
                            onClick={() => navigate('/login')}
                            className="btn btn-primary"
                            style={{ padding: '16px 32px', fontSize: '1rem', borderRadius: 14, fontWeight: 700, boxShadow: '0 12px 32px rgba(99, 102, 241, 0.3)', whiteSpace: 'nowrap' as any }}
                        >
                            Start Building Free <ArrowRight size={20} style={{ marginLeft: 10 }} />
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '16px 32px', fontSize: '1rem', borderRadius: 14, fontWeight: 600, whiteSpace: 'nowrap' as any }}
                        >
                            Explore Features
                        </button>
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="floating" style={{
                    position: 'absolute', top: '15%', right: '12%',
                    width: 70, height: 70, borderRadius: 20,
                    background: 'rgba(255, 255, 255, 0.8)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(0,0,0,0.05)'
                }}>
                    <FolderKanban color="#6366f1" size={32} />
                </div>
                <div className="floating" style={{
                    position: 'absolute', bottom: '25%', left: '12%',
                    width: 90, height: 90, borderRadius: 24,
                    background: 'rgba(255, 255, 255, 0.8)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animationDelay: '0.7s',
                    border: '1px solid rgba(0,0,0,0.05)'
                }}>
                    <BarChart3 color="#a78bfa" size={40} />
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" style={{ padding: '80px 5%', background: '#fafafa', position: 'relative' }}>
                <div style={{ textAlign: 'center', marginBottom: 60 }}>
                    <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.04em', color: '#171717' }}>Everything you need.</h2>
                    <p style={{ color: '#525252', fontSize: '1.1rem', marginTop: 16 }}>Powerful tools designed for speed and clarity.</p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
                    gap: 24,
                    maxWidth: 1250,
                    margin: '0 auto'
                }}>
                    <FeatureCard
                        icon={<CheckCircle size={32} color="#6366f1" />}
                        title="Precision Tasks"
                        description="Granular task management with priority levels, attachments, and real-time status syncing."
                    />
                    <FeatureCard
                        icon={<Users size={32} color="#a78bfa" />}
                        title="Seamless Teams"
                        description="Multi-role access for Admins, Managers, and Employees. Collaboration built into the core."
                    />
                    <FeatureCard
                        icon={<Zap size={32} color="#f59e0b" />}
                        title="Smart Alerts"
                        description="Intelligent notifications that keep everyone aligned without the noise of typical tools."
                    />
                </div>
            </section>

            {/* Testimonials */}
            {/* <section style={{ padding: '120px 8%', background: 'white' }}>
                <div style={{ textAlign: 'center', marginBottom: 80 }}>
                    <p style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Testimonials</p>
                    <h2 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.04em' }}>Loved by industry leaders.</h2>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: 40,
                    maxWidth: 1250,
                    margin: '0 auto'
                }}>
                    <TestimonialCard
                        quote="FlowDesk has completely transformed how we handle client Projects. The UI is exceptionally polished."
                        author="Sarah Jenkins"
                        role="Product Lead at Vercel"
                        avatar="https://ui-avatars.com/api/?name=Sarah+Jenkins&background=6366f1&color=fff"
                    />
                    <TestimonialCard
                        quote="The most intuitive project management tool I've used. It actually makes work feel faster."
                        author="Marcus Chen"
                        role="Senior Architect at Stripe"
                        avatar="https://ui-avatars.com/api/?name=Marcus+Chen&background=a78bfa&color=fff"
                    />
                    <TestimonialCard
                        quote="Finally, a tool that balances power and simplicity. Our team coordination is up by 40%."
                        author="Elena Rodriguez"
                        role="COO at Airbnb"
                        avatar="https://ui-avatars.com/api/?name=Elena+Rodriguez&background=f59e0b&color=fff"
                    />
                </div>
            </section> */}

            {/* Pricing Section */}
            {/* <section id="pricing" style={{ padding: '120px 8%', background: '#fafafa' }}>
                <div style={{ textAlign: 'center', marginBottom: 80 }}>
                    <h2 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.04em' }}>Simple, transparent pricing.</h2>
                    <p style={{ color: '#525252', fontSize: '1.2rem', marginTop: 16 }}>Choose the plan that's right for your team's scale.</p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: 32,
                    maxWidth: 1250,
                    margin: '0 auto'
                }}>
                    <PricingCard
                        title="Free"
                        price="$0"
                        description="Perfect for individuals and side projects."
                        features={['Up to 3 members', 'Basic task tracking', '500MB storage', 'Community support']}
                        cta="Start for free"
                    />
                    <PricingCard
                        title="Pro"
                        price="$19"
                        description="Everything you need to scale your team."
                        features={['Unlimited members', 'Advanced reporting', '10GB storage', 'Priority support', 'Custom roles']}
                        cta="Get Started"
                        popular
                    />
                    <PricingCard
                        title="Enterprise"
                        price="Custom"
                        description="Advanced security and scale for big teams."
                        features={['Single Sign-On (SSO)', 'Unlimited storage', 'Dedicated manager', 'API access', 'Custom contracts']}
                        cta="Contact Sales"
                    />
                </div>
            </section> */}

            {/* FAQ Section */}
            <section style={{ padding: '80px 5%', background: 'white' }}>
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 60 }}>
                        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>Frequently Asked Questions</h2>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <FaqItem
                            index={0}
                            active={activeFaq === 0}
                            onClick={() => setActiveFaq(activeFaq === 0 ? null : 0)}
                            question="How secure is my data on FlowDesk?"
                            answer="We use industry-standard AES-256 encryption for all data at rest and TLS 1.3 for data in transit. Your security is our top priority."
                        />
                        <FaqItem
                            index={1}
                            active={activeFaq === 1}
                            onClick={() => setActiveFaq(activeFaq === 1 ? null : 1)}
                            question="Can I invite external collaborators?"
                            answer="Yes! Our Pro and Enterprise plans allow you to invite guests to specific projects without giving them full access to your workspace."
                        />
                        <FaqItem
                            index={2}
                            active={activeFaq === 2}
                            onClick={() => setActiveFaq(activeFaq === 2 ? null : 2)}
                            question="What kind of support do you offer?"
                            answer="Free users get community support. Pro users get priority email support, and Enterprise customers have a dedicated success manager."
                        />
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section style={{ padding: '0 8% 120px' }}>
                <div style={{
                    background: 'linear-gradient(135deg, #171717, #333)',
                    borderRadius: 32,
                    padding: 'clamp(40px, 8vw, 100px) clamp(20px, 5vw, 40px)',
                    textAlign: 'center',
                    color: 'white',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative', zIndex: 1 }}>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, marginBottom: 24, letterSpacing: '-0.04em' }}>Ready to transform your workflow?</h2>
                        <p style={{ fontSize: '1.25rem', color: '#a3a3a3', marginBottom: 48 }}>Join thousands of high-performance teams already using FlowDesk.</p>
                        <button
                            onClick={() => navigate('/login')}
                            className="btn btn-primary"
                            style={{ padding: '20px 48px', fontSize: '1.1rem', borderRadius: 16, border: 'none', background: 'white', color: '#171717', fontWeight: 700 }}
                        >
                            Get Started Now
                        </button>
                    </div>
                    {/* Decorative Blobs */}
                    <div style={{ position: 'absolute', top: '-50%', left: '-10%', width: 400, height: 400, background: 'rgba(99, 102, 241, 0.1)', filter: 'blur(80px)', borderRadius: '50%' }}></div>
                    <div style={{ position: 'absolute', bottom: '-50%', right: '-10%', width: 400, height: 400, background: 'rgba(167, 139, 250, 0.1)', filter: 'blur(80px)', borderRadius: '50%' }}></div>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ padding: '80px 8% 64px', borderTop: '1px solid #f0f0f0', background: 'white' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 40, maxWidth: 1250, margin: '0 auto' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                            <Zap size={24} color="#6366f1" />
                            <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>FlowDesk</span>
                        </div>
                        <p style={{ color: '#737373', fontSize: '1rem', maxWidth: 300, lineHeight: 1.6 }}>The next generation workspace for modern teams. Built for beauty, speed, and precision.</p>
                    </div>
                    <FooterCol title="Product" links={['Features', 'Updates', 'Templates', 'API']} />
                    <FooterCol title="Company" links={['About', 'Careers', 'Contact', 'Privacy']} />
                    <FooterCol title="Support" links={['Help Center', 'Guides', 'Security', 'Status']} />
                </div>
                <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 80, paddingTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                    <div style={{ color: '#a3a3a3', fontSize: '0.9rem' }}>
                        © 2026 FlowDesk Inc. All rights reserved.
                    </div>
                    <div style={{ display: 'flex', gap: 24, color: '#171717', fontSize: '0.9rem', fontWeight: 500 }}>
                        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>Twitter</a>
                        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>LinkedIn</a>
                        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>GitHub</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard: React.FC<{ icon: React.ReactNode, title: string, description: string }> = ({ icon, title, description }) => (
    <div className="glass-card" style={{ padding: 'clamp(24px, 4vw, 48px)', borderRadius: 24 }}>
        <div style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'rgba(99, 102, 241, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32
        }}>{icon}</div>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>{title}</h3>
        <p style={{ color: '#525252', fontSize: '1.05rem', lineHeight: 1.7 }}>{description}</p>
    </div>
);

// const TestimonialCard: React.FC<{ quote: string, author: string, role: string, avatar: string }> = ({ quote, author, role, avatar }) => (
//     <div className="glass-card" style={{ padding: 40, borderRadius: 28, position: 'relative' }}>
//         <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
//             {[1, 2, 3, 4, 5].map(i => <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />)}
//         </div>
//         <p style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.6, color: '#171717', marginBottom: 32 }}>"{quote}"</p>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
//             <img src={avatar} alt={author} style={{ width: 48, height: 48, borderRadius: '50%' }} />
//             <div>
//                 <p style={{ fontWeight: 700, fontSize: '1rem', color: '#171717' }}>{author}</p>
//                 <p style={{ fontSize: '0.875rem', color: '#737373' }}>{role}</p>
//             </div>
//         </div>
//     </div>
// );

// const PricingCard: React.FC<{ title: string, price: string, description: string, features: string[], cta: string, popular?: boolean }> = ({ title, price, description, features, cta, popular }) => (
//     <div className={`glass-card ${popular ? 'pricing-card-popular' : ''}`} style={{ padding: 48, borderRadius: 32, display: 'flex', flexDirection: 'column' }}>
//         <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 12 }}>{title}</h3>
//         <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
//             <span style={{ fontSize: '3rem', fontWeight: 800 }}>{price}</span>
//             {price !== 'Custom' && <span style={{ color: '#737373', fontWeight: 500 }}>/month</span>}
//         </div>
//         <p style={{ color: '#525252', marginBottom: 32, fontSize: '1rem' }}>{description}</p>

//         <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48, flex: 1 }}>
//             {features.map(f => (
//                 <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.95rem', color: '#171717' }}>
//                     <CheckCircle size={18} color="#10b981" />
//                     {f}
//                 </div>
//             ))}
//         </div>

//         <button className={`btn ${popular ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%', padding: '16px', borderRadius: 14, fontWeight: 700 }}>
//             {cta}
//         </button>
//     </div>
// );

const FaqItem: React.FC<{ index: number, active: boolean, onClick: () => void, question: string, answer: string }> = ({ active, onClick, question, answer }) => (
    <div className="faq-item" style={{ padding: '24px 0' }}>
        <button
            onClick={onClick}
            style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left'
            }}
        >
            <span style={{ fontSize: '1.15rem', fontWeight: 600, color: '#171717' }}>{question}</span>
            {active ? <Minus size={20} color="#6366f1" /> : <Plus size={20} color="#6366f1" />}
        </button>
        {active && (
            <div style={{ marginTop: 16, color: '#525252', lineHeight: 1.6, fontSize: '1.05rem', animation: 'fadeIn 0.3s ease' }}>
                {answer}
            </div>
        )}
    </div>
);

const FooterCol: React.FC<{ title: string, links: string[] }> = ({ title, links }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#171717' }}>{title}</h4>
        {links.map(l => <a key={l} href="#" style={{ textDecoration: 'none', color: '#737373', fontSize: '0.95rem' }}>{l}</a>)}
    </div>
);

export default LandingPage;
