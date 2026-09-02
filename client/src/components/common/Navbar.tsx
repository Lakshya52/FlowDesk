// import React from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";


const Navbar = () => {
	return (
		<>
			{/* navbar glassmorphism effect */}
			<nav className="fixed top-6 left-1/2 z-[2000] -translate-x-1/2 w-[90dvw] sm:w-[80dvw] md:w-[70dvw]">
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
						].map((link) => (
							<Link
								key={link.name}
								to={link.href}
								className={`text-[#0a0038] focus:text-(--color-primary) focus:text-bold font-manrope hover:text-[#0a0038]/50 text-sm font-medium tracking-wide transition-colors duration-100  focus:outline-(--color-primary) focus:outline rounded-full px-2  focus:outline-offset-2 
								
								`}
							>
								{link.name}
							</Link>
						))}
					</div>

                    <div className="w-1/2 sm:w-1/3 flex items-center justify-end">


					{/* CTA */}
					<Link
						to="/login"
						className="bg-white text-[#0a0038] font-bold text-sm px-5 py-2.5 rounded-full cursor-pointer hover:bg-[#0a0038] hover:text-white font-manrope transition-colors duration-200 inline-flex items-center focus:outline focus:outline-offset-2 focus:outline-(--color-primary)"
                        >
						<span className="sm:block hidden ">Get Started</span>
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
