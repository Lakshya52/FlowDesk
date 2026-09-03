// import React from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";


const Navbar = () => {

	const GitHubIcon = () => (
	<svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
	</svg>
);

	return (
		<>
			{/* navbar glassmorphism effect */}
			<nav className="fixed top-6 left-1/2 z-2000 -translate-x-1/2 w-[90dvw] sm:w-[80dvw] md:w-[70dvw]">
				<div className="flex items-center justify-between p-2 rounded-full border border-white/20 bg-white/30   sm:bg-[#7c3aed]/20 backdrop-blur-md">
					{/* Logo */}
					<Link
						to="/"
						className="text-[#0a0038] outline-none font-manrope-bold text-xl tracking-tight pl-5 flex items-center gap-2 w-1/2 sm:w-1/3"
					>
                        <div
						style={{
							width: 28,
							height: 28,
                            borderRadius: 8,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
						className="overflow-hidden"
					>
						<img
							src="/icon.ico"
							alt="FlowDesk logo"
							className="rounded-xl scale-125"
						/>
					</div>
						FlowDesk
					</Link>

					{/* Links */}
					<div className="gap-8 hidden sm:flex w-1/3 items-center justify-center">
						{[
							// { name: "Features", href: "/features" },
							{ name: "Releases", href: "/release" },
							{ name: "Documentation", href: "/documentation" },
							// { name: "Support", href: "/support" },
							// { name: "Github", href: "https://github.com/Lakshya52/FlowDesk" },
						].map((link) => (
							<Link
								key={link.name}
								to={link.href}
								{...{
									href: link.href.startsWith("https") ? "_blank" : undefined,
									// rel: link.href.startsWith("https") ? "noopener noreferrer" : undefined,
									rel: link.href.startsWith("https") ? "_blank" : undefined,
								}}
								className={`text-[#0a0038] focus:text-(--color-primary) focus:text-bold font-manrope hover:text-[#0a0038]/50 text-sm font-medium tracking-wide transition-colors duration-100  focus:outline-(--color-primary) focus:outline rounded-full px-2  focus:outline-offset-2 
								
								`}
							>
								{link.name}
							</Link>
						))}
					</div>

                    <div className="w-1/2 sm:w-1/3 flex items-center justify-end">
						<Link
							to="https://github.com/Lakshya52/flowdesk/"
							target="_blank"
							className="group mr-4 flex items-center gap-1 text-[#0a0038] hover:text-[#0a0038]/50 transition-colors"
							>
							<div className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:w-16 group-hover:opacity-100">
								<div className="text-[#0a0038a9]">Github</div>
							</div>
							<GitHubIcon />
						</Link>
						<Link
							to="/login"
							className="bg-white text-[#0a0038] font-bold text-sm px-5 py-2.5 rounded-full cursor-pointer hover:bg-[#0a0038] hover:text-white font-manrope transition-colors duration-200 inline-flex items-center focus:outline focus:outline-offset-2 focus:outline-(--color-primary)"
							>
							<span className="sm:block hidden">Get Started</span>
							<span className="sm:hidden block">
								<ArrowUpRight />
							</span>
						</Link>
					</div>
				</div>
			</nav>
		</>
	);
};

export default Navbar;
