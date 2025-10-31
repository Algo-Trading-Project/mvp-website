import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/api/entities";
import {
  TrendingUp,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  LayoutGrid,
  User as UserIcon,
  DollarSign,
  Users,
  Mail,
  BookOpen,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      setAuthLoading(true);
      try {
        // Re-enable the live authentication check
        const me = await User.me();
        // Initialize custom fields if missing on first login and update last_login
        const updates = {};
        if (!me.subscription_level) {
          updates.subscription_level = "free";
        }
        updates.last_login = new Date().toISOString();
        if (Object.keys(updates).length > 0) {
          await User.updateMyUserData(updates);
          // reflect updates locally without another fetch
          Object.assign(me, updates);
        }
        setUser(me);
      } catch (e) {
        setUser(null);
      }
      setAuthLoading(false);
    };
    checkUser();
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await User.logout();
    setUser(null);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.removeItem("account-page-cache");
        window.sessionStorage?.removeItem("pricing-authed");
        window.sessionStorage?.removeItem("dashboard-cache-v1");
        window.sessionStorage?.removeItem("top-signals-cache-v1");
        window.sessionStorage?.removeItem("backtest-cache-v1");
      } catch (error) {
        console.warn("Failed to clear account cache", error);
      }
    }
    // Force a redirect to Home so the user never remains on the current page
    window.location.href = createPageUrl("Home");
  };

  // Unified nav button classes
  const navBtnBase = "inline-flex items-center h-9 px-3 rounded-md text-sm font-medium transition-colors transition-transform hover:-translate-y-[1px]";
  const activeClasses = "text-white bg-white/10";
  const idleClasses = "text-white/90 hover:text-white hover:bg-white/5";

  const NavLink = ({ href, children, className }) => {
    const isActive = currentPageName === href;
    return (
      <Link
        to={createPageUrl(href)}
        className={`${navBtnBase} ${isActive ? activeClasses : idleClasses} ${className || ""}`}
      >
        {children}
      </Link>
    );
  };
  NavLink.propTypes = {
    href: PropTypes.string.isRequired,
    children: PropTypes.node,
    className: PropTypes.string,
  };

  // Finalized dropdown: 
  // - Opens on hover or click
  // - Clicking toggles open/close even while hovered
  // - ALWAYS closes when mouse leaves both trigger and menu
  const NavDropdown = ({ label, items }) => {
    const [open, setOpen] = useState(false);
    const [overContent, setOverContent] = useState(false);

    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <div className="relative">
          <DropdownMenuTrigger asChild>
            <button
              className={`${navBtnBase} ${idleClasses}`}
              aria-expanded={open}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => {
                if (!overContent) setOpen(false);
              }}
              onClick={(e) => {
                e.preventDefault();
                setOpen((prev) => !prev);
              }}
            >
              {label}
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="bg-slate-900 border-slate-700 text-white rounded-md"
            sideOffset={0}
            align="start"
            onMouseEnter={() => {
              setOverContent(true);
              setOpen(true);
            }}
            onMouseLeave={() => {
              setOverContent(false);
              setOpen(false);
            }}
          >
            {items.map((item) => (
              <DropdownMenuItem asChild key={item.label} className="cursor-pointer">
                <Link
                  to={createPageUrl(item.href)}
                  className="flex items-center"
                  onClick={(e) => {
                    try {
                      // Always land at top when navigating via dropdown
                      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
                    } catch {}
                  }}
                >
                  {item.icon ? <item.icon className="mr-2 h-4 w-4" /> : null}
                  <span>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    );
  };
  NavDropdown.propTypes = {
    label: PropTypes.string.isRequired,
    items: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string.isRequired,
        href: PropTypes.string.isRequired,
        icon: PropTypes.elementType,
      })
    ).isRequired,
  };

  // Simplified Product menu: Dashboard, Live Performance, Signals only
  const renderNavLinks = () => {
    const productItems = [
      { label: "Dashboard", href: "Dashboard?tab=overview", icon: LayoutGrid },
      { label: "Signals", href: "Signals", icon: TrendingUp }
    ];
    const resourceItems = [
      { label: "API Docs", href: "Docs", icon: BookOpen },
      { label: "Contact", href: "Contact", icon: Mail }
    ];
    return (
      <>
        <NavDropdown label="Product" items={productItems} />
        <NavDropdown label="Resources" items={resourceItems} />
        <NavLink href="Pricing">Pricing</NavLink>
      </>
    );
  };

  const renderAuthButtons = () => {
    if (authLoading) {
       return <div className="h-10 w-24 bg-slate-800 rounded-md animate-pulse" />;
    }
    if (user) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-2 rounded-md">
              <UserIcon className="w-5 h-5" />
              <span>{user.full_name || user.email.split('@')[0]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-slate-900 border-slate-700 text-white rounded-md">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl("Account")} className="flex items-center cursor-pointer rounded-sm">
                <Settings className="mr-2 h-4 w-4" />
                <span>Account</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-500/10 rounded-sm">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 rounded-md">
          <Link to={createPageUrl('GetStarted')}>Sign In</Link>
        </Button>
      </>
    );
  }

  // Subtle page fade-in on route change
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    setPageVisible(false);
    const t = setTimeout(() => setPageVisible(true), 20);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className="bg-slate-950 text-white min-h-screen font-sans">
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
        {/* Add small horizontal padding so logo/profile aren’t flush to the edges */}
        <nav className="w-full flex items-center justify-between py-5 px-3 sm:px-4"> {/* was py-4 -> py-5 to give logo a bit more room */}
          {/* Left group: logo + nav links */}
          <div className="flex items-center space-x-4">
            <Link
              to={createPageUrl("Home")}
              className="flex items-center space-x-2"
              onClick={(e) => {
                try {
                  // Always scroll to top on logo click; if already on Home prevent duplicate navigation
                  const target = createPageUrl('Home');
                  const here = location?.pathname || '';
                  if (here.toLowerCase() === target.toLowerCase()) {
                    e.preventDefault();
                  }
                  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                } catch {}
              }}
            >
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68af602ca8efcb2960befb31/3713063a0_a75b3b70b_logo.png"
                alt="Home"
                className="h-16 w-16 object-contain"  /* enlarged logo only */
                loading="lazy"
              />
            </Link>
            <div className="hidden lg:flex lg:gap-x-4 items-center">
              {renderNavLinks()}
            </div>
          </div>

          {/* Right group: auth area unchanged (button sizes remain the same) */}
          <div className="hidden lg:flex items-center gap-x-3 mr-3">
            {renderAuthButtons()}
          </div>

          {/* Mobile menu trigger stays at far right */}
          <div className="flex lg:hidden">
            <button
              type="button"
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </nav>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-slate-900 px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-white/10">
            <div className="flex items-center justify-between">
            <Link
              to={createPageUrl("Home")}
              className="flex items-center space-x-2"
              onClick={(e) => {
                try {
                  const target = createPageUrl('Home');
                  const here = location?.pathname || '';
                  if (here.toLowerCase() === target.toLowerCase()) {
                    e.preventDefault();
                  }
                  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                } catch {}
              }}
            >
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68af602ca8efcb2960befb31/3713063a0_a75b3b70b_logo.png"
                  alt="Home"
                  className="h-16 w-16 object-contain"  /* enlarged mobile logo */
                  loading="lazy"
                />
              </Link>
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-slate-700">
                <div className="space-y-2 py-6">
                  {/* Pricing Link (top-level) */}
                  <Link to={createPageUrl("Pricing")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <DollarSign className="w-5 h-5" />
                    <span>Pricing</span>
                  </Link>

                  {/* Product group */}
                  <div className="text-xs uppercase tracking-wide text-slate-500 px-3 pt-4">Product</div>
                  {/* Live Performance link removed to avoid redundancy */}
                  <Link to={createPageUrl("Dashboard?tab=overview")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <LayoutGrid className="w-5 h-5" />
                    <span>Dashboard</span>
                  </Link>
                  <Link to={createPageUrl("Signals")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <TrendingUp className="w-5 h-5" />
                    <span>Signals</span>
                  </Link>
                  
                  {/* Resources group */}
                  <div className="text-xs uppercase tracking-wide text-slate-500 px-3 pt-4">Resources</div>
                  <Link to={createPageUrl("About")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <Users className="w-5 h-5" />
                    <span>About</span>
                  </Link>
                  <Link to={createPageUrl("Contact")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <Mail className="w-5 h-5" />
                    <span>Contact</span>
                  </Link>
                </div>
                <div className="py-6">
                  {user ? (
                    <>
                      <Link to={createPageUrl("Account")} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-slate-300 hover:bg-slate-800 hover:text-white">
                        <UserIcon className="w-5 h-5" />
                        <span>Account</span>
                      </Link>
                      <button onClick={handleLogout} className="-mx-3 flex items-center space-x-3 rounded-md px-3 py-2 text-base font-semibold leading-7 text-red-400 hover:bg-slate-800 hover:text-white w-full">
                        <LogOut className="w-5 h-5" />
                        <span>Log Out</span>
                      </button>
                    </>
                  ) : (
                    <Link to={createPageUrl("GetStarted")}>
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 rounded-md">
                        Sign In
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main>
        <div className={`transition-opacity duration-300 ${pageVisible ? 'opacity-100' : 'opacity-0'}`}>
          {children}
        </div>
      </main>

      <footer className="bg-slate-950 border-t border-slate-800 mt-16">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex justify-center space-x-6 md:order-2">
              <Link to={createPageUrl("Pricing")} className="text-slate-400 hover:text-slate-300">Pricing</Link>
              <a href="https://discord.gg/quantpulse" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-300">Discord</a>
              <Link to={createPageUrl("Status")} className="text-slate-400 hover:text-slate-300">Status</Link>
            </div>
            <div className="mt-8 md:mt-0 md:order-1">
              <p className="text-center text-base text-slate-500">
                &copy; {new Date().getFullYear()} QuantPulse. All rights reserved. Not financial advice.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

Layout.propTypes = {
  children: PropTypes.node,
  currentPageName: PropTypes.string,
};
