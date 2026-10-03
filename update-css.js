const fs = require('fs');
let css = fs.readFileSync('public/style.css', 'utf8');

// Hotbar container
css = css.replace(
    /\.hotbar-container\s*{[^}]*}/,
    `.hotbar-container {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    z-index: 10;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}`
);

// Block select
css = css.replace(
    /\/\*\s*Block Select Items\s*\*\/[\s\S]*?user-select:\s*none;\s*position:\s*relative;\s*}/,
    `/* Block Select Items */
.block-select {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 58px;
    padding: 8px 4px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    cursor: pointer;
    font-size: 0.55rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    user-select: none;
    position: relative;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
}

.block-select:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-4px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.block-select.selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    color: #e0f2fe;
    transform: translateY(-8px) scale(1.05);
    box-shadow: 0 8px 25px rgba(56, 189, 248, 0.4), inset 0 0 15px rgba(56, 189, 248, 0.2);
}`
);

// Slot num
css = css.replace(
    /\.block-select \.slot-num\s*{[^}]*}/,
    `.block-select .slot-num {
    position: absolute;
    top: -8px; left: -8px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    color: white;
    border-radius: 50%;
    width: 18px; height: 18px;
    font-size: 10px;
    display: flex; justify-content: center; align-items: center;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    border: 2px solid rgba(255,255,255,0.1);
}`
);

// Inventory Window
css = css.replace(
    /\.inventory-window\s*{[^}]*}/,
    `.inventory-window {
    width: min(650px, calc(100vw - 32px));
    height: min(500px, calc(100vh - 64px));
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 60px rgba(0,0,0,0.7);
    transform: scale(0.95);
    animation: popup 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}`
);

// Chat Window
css = css.replace(
    /\.chat-glass\s*{[^}]*}/,
    `.chat-glass {
    width: 280px;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}`
);

fs.writeFileSync('public/style.css', css);
console.log('CSS updated successfully');
