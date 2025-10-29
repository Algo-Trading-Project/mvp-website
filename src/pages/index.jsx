import Layout from "./Layout.jsx";
import Pricing from "./Pricing";
import Dashboard from "./Dashboard";
import Downloads from "./Downloads";
import Home from "./Home";
import Account from "./Account";
import GetStarted from "./GetStarted";
import Contact from "./Contact";
import Signals from "./Signals";
import AuthCallback from "./AuthCallback";
import Status from "./Status";
import Docs from "./Docs";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    // Put Home first so unknown/"/" defaults to Home
    Home: Home,
    Pricing: Pricing,
    Dashboard: Dashboard,
    Downloads: Downloads,
    Account: Account,
    GetStarted: GetStarted,
    Contact: Contact,
    Signals: Signals,
    AuthCallback: AuthCallback,
    Status: Status,
    Docs: Docs,
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
                
                
                
                
                <Route path="/home" element={<Home />} />
                
                <Route path="/account" element={<Account />} />
                
                <Route path="/getstarted" element={<GetStarted />} />
                
                
                
                <Route path="/contact" element={<Contact />} />
                
                <Route path="/signals" element={<Signals />} />
                
                <Route path="/authcallback" element={<AuthCallback />} />
                
                <Route path="/status" element={<Status />} />
                
                <Route path="/docs" element={<Docs />} />
                
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
