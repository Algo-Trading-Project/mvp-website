import Layout from "./Layout.jsx";

import Pricing from "./Pricing";

import Dashboard from "./Dashboard";

import Downloads from "./Downloads";


import Methodology from "./Methodology";

import Home from "./Home";

import Account from "./Account";

import GetStarted from "./GetStarted";

import About from "./About";

import Contact from "./Contact";

import Signals from "./Signals";

import AuthCallback from "./AuthCallback";

import WhatsNew from "./WhatsNew";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    // Put Home first so unknown/"/" defaults to Home
    Home: Home,
    Pricing: Pricing,
    Dashboard: Dashboard,
    Downloads: Downloads,
    Methodology: Methodology,
    Account: Account,
    GetStarted: GetStarted,
    About: About,
    Contact: Contact,
    Signals: Signals,
    AuthCallback: AuthCallback,
    WhatsNew: WhatsNew,
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                <Route path="/" element={<Home />} />
                
                <Route path="/pricing" element={<Pricing />} />
                
                <Route path="/dashboard" element={<Dashboard />} />
                
                <Route path="/downloads" element={<Downloads />} />
                
                
                <Route path="/methodology" element={<Methodology />} />
                
                <Route path="/home" element={<Home />} />
                
                <Route path="/account" element={<Account />} />
                
                <Route path="/getstarted" element={<GetStarted />} />
                
                <Route path="/about" element={<About />} />
                
                <Route path="/contact" element={<Contact />} />
                
                <Route path="/signals" element={<Signals />} />
                
                <Route path="/authcallback" element={<AuthCallback />} />
                
                <Route path="/whatsnew" element={<WhatsNew />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
