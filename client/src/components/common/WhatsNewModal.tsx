import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { WhatsNewEntry, markVersionSeen } from "../../lib/whatsnew";

interface WhatsNewModalProps {
	open: boolean;
	entry: WhatsNewEntry;
	onClose: () => void;
}

const TYPE_META = {
	new: {
		color: "#34d399",
		bg: "rgba(52,211,153,0.12)",
		label: "New",
	},
	fixed: {
		color: "#fbbf24",
		bg: "rgba(251,191,36,0.12)",
		label: "Fixed",
	},
	improved: {
		color: "#60a5fa",
		bg: "rgba(96,165,250,0.12)",
		label: "Improved",
	},
} as const;

const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
	open,
	entry,
	onClose,
}) => {
	const navigate = useNavigate();
	const [revealed, setRevealed] = useState(false);
	const [cardsRevealed, setCardsRevealed] = useState(false);

	useEffect(() => {
		if (!open) {
			setRevealed(false);
			setCardsRevealed(false);
			return;
		}
		document.body.style.overflow = "hidden";
		const t1 = setTimeout(() => setRevealed(true), 40);
		const t2 = setTimeout(() => setCardsRevealed(true), 260);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
			document.body.style.overflow = "";
		};
	}, [open]);

	if (!open) return null;

	const handleContinue = () => {
		markVersionSeen(entry.version);
		onClose();
	};

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 5500,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "16px",
				backgroundColor: "rgba(0, 0, 0, 0.6)",
				backdropFilter: "blur(16px)",
				WebkitBackdropFilter: "blur(16px)",
				opacity: revealed ? 1 : 0,
				transition: "opacity 0.3s ease",
			}}
			onClick={handleContinue}
		>
			<div
				style={{
					width: "100%",
					maxWidth: 520,
					maxHeight: "min(88vh, 720px)",
					borderRadius: 24,
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
					background: "rgba(17, 18, 20, 0.92)",
					border: "1px solid rgba(255,255,255,0.08)",
					boxShadow:
						"0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
					transform: revealed
						? "translateY(0) scale(1)"
						: "translateY(18px) scale(0.97)",
					transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* ─── Hero ─── */}
				<div
					style={{
						position: "relative",
						flexShrink: 0,
						padding: "32px 32px 24px",
						background:
							"linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(139,92,246,0.22) 50%, rgba(236,72,153,0.16) 100%)",
						borderBottom: "1px solid rgba(255,255,255,0.06)",
						overflow: "clip",
						minHeight: "fit-content",
					}}
				>
					{/* Decorative blurred orbs */}
					<div
						style={{
							position: "absolute",
							top: -60,
							right: -60,
							width: 200,
							height: 200,
							borderRadius: "50%",
							background:
								"radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)",
							filter: "blur(40px)",
							pointerEvents: "none",
						}}
					/>
					<div
						style={{
							position: "absolute",
							bottom: -40,
							left: "30%",
							width: 160,
							height: 160,
							borderRadius: "50%",
							background:
								"radial-gradient(circle, rgba(59,130,246,0.28) 0%, transparent 70%)",
							filter: "blur(36px)",
							pointerEvents: "none",
						}}
					/>
					<div className="flex items-center justify-between w-full">
						{/* Title */}
						<h2
							style={{
								margin: 0,
								fontSize: "1.65rem",
								fontWeight: 800,
								letterSpacing: "-0.03em",
								lineHeight: 1.2,
								color: "#fff",
								position: "relative",
								overflowWrap: "break-word",
							}}
						>
							{/* <span>What&rsquo;s new</span> */}
							<span>What's new</span>
							<br />
							<span
								style={{
									background:
										"linear-gradient(90deg, #60a5fa, #c084fc, #f472b6)",
									WebkitBackgroundClip: "text",
									WebkitTextFillColor: "transparent",
								}}
							>
								v{entry.version}
							</span>
						</h2>

						<div
							style={{
								marginTop: 16,
								display: "inline-flex",
								alignItems: "center",
								gap: 8,
								padding: "4px 14px",
								borderRadius: 999,
								background: "rgba(255,255,255,0.08)",
								border: "1px solid rgba(255,255,255,0.06)",
								fontSize: "0.75rem",
								color: "rgba(255,255,255,0.55)",
								fontWeight: 500,
								position: "relative",
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: "#34d399",
								}}
							/>
							{entry.date}
						</div>
					</div>
				</div>

				{/* ─── Body ─── */}
				<div
					style={{
						padding: "20px 28px",
						overflowY: "auto",
						flex: 1,
						display: "flex",
						flexDirection: "column",
						gap: 10,
					}}
				>
					{entry.title && (
						<p
							style={{
								margin: "0 4px 4px",
								fontSize: "0.82rem",
								fontWeight: 600,
								color: "rgba(255,255,255,0.45)",
								letterSpacing: "0.06em",
								textTransform: "uppercase",
							}}
						>
							{entry.title}
						</p>
					)}

					{entry.changes.length > 0 && (
						<div
							className="whatsnew-cards"
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 10,
							}}
						>
							{entry.changes.map((c, i) => {
								const meta = TYPE_META[c.type];
								return (
									<div
										key={i}
										style={{
											display: "flex",
											gap: 14,
											padding: "14px 16px",
											borderRadius: 14,
											background:
												"rgba(255,255,255,0.04)",
											border: "1px solid rgba(255,255,255,0.05)",
											opacity: cardsRevealed ? 1 : 0,
											transform: cardsRevealed
												? "translateY(0)"
												: "translateY(8px)",
											transition:
												"opacity 0.3s ease, transform 0.3s ease",
											transitionDelay: cardsRevealed
												? `${i * 70}ms`
												: "0ms",
										}}
									>
										<div style={{ minWidth: 0 }}>
											<span
												style={{
													display: "inline-block",
													fontSize: "0.65rem",
													fontWeight: 700,
													letterSpacing: "0.05em",
													textTransform: "uppercase",
													color: meta.color,
													marginBottom: 3,
												}}
											>
												{meta.label}
											</span>
											<p
												style={{
													margin: 0,
													fontSize: "0.875rem",
													lineHeight: 1.55,
													color: "rgba(255,255,255,0.78)",
												}}
											>
												{c.text}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					)}

					{/* Full release body (markdown) — shown when no structured changes were parsed */}
					{entry.changes.length === 0 && entry.body && (
						<div
							style={{
								fontSize: "0.9rem",
								lineHeight: 1.6,
								color: "rgba(255,255,255,0.8)",
								margin: 0,
							}}
						>
							<Markdown
								components={{
									a: (props) => (
										<a
											{...props}
											target="_blank"
											rel="noreferrer"
											style={{ color: "#60a5fa" }}
										/>
									),
								}}
							>
								{entry.body}
							</Markdown>
						</div>
					)}
				</div>

				{/* ─── Footer ─── */}
				<div
					style={{
						padding: "16px 28px 20px",
						borderTop: "1px solid rgba(255,255,255,0.06)",
						display: "flex",
						alignItems: "center",
						gap: 14,
						background: "rgba(0,0,0,0.18)",
					}}
				>
					<button
						onClick={() => navigate("/release")}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 5,
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: 0,
							color: "rgba(255,255,255,0.4)",
							fontSize: "0.78rem",
							fontWeight: 500,
							transition: "color 0.2s",
						}}
						onMouseEnter={(e) =>
							(e.currentTarget.style.color =
								"rgba(255,255,255,0.75)")
						}
						onMouseLeave={(e) =>
							(e.currentTarget.style.color =
								"rgba(255,255,255,0.4)")
						}
					>
						All releases
					</button>

					<button
						onClick={handleContinue}
						style={{
							marginLeft: "auto",
							display: "flex",
							alignItems: "center",
							gap: 8,
							background:
								"linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)",
							border: "none",
							cursor: "pointer",
							padding: "11px 22px",
							borderRadius: 12,
							color: "#fff",
							fontSize: "0.875rem",
							fontWeight: 700,
							letterSpacing: "-0.01em",
							boxShadow:
								"0 4px 16px rgba(139,92,246,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.boxShadow =
								"0 6px 24px rgba(139,92,246,0.5), 0 0 0 1px rgba(255,255,255,0.15) inset";
							e.currentTarget.style.transform =
								"translateY(-1px)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.boxShadow =
								"0 4px 16px rgba(139,92,246,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset";
							e.currentTarget.style.transform = "translateY(0)";
						}}
					>
						Continue
					</button>
				</div>
			</div>
		</div>
	);
};

export default WhatsNewModal;
