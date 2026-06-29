import { useState, useEffect } from 'react';
import { hexToRgb, rgbToHex, rgbToCmy, cmyToRgb } from '../utils/colorUtils';

export default function ColorPicker({ hex, onChange }) {
  const [hexInput, setHexInput] = useState(hex || '');
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [cmy, setCmy] = useState({ c: 0, m: 0, y: 0 });

  useEffect(() => {
    const parsed = hexToRgb(hex || '');
    if (parsed) {
      setHexInput(rgbToHex(parsed));
      setRgb(parsed);
      setCmy(rgbToCmy(parsed));
    } else {
      setHexInput('');
      setRgb({ r: 0, g: 0, b: 0 });
      setCmy({ c: 0, m: 0, y: 0 });
    }
  }, [hex]);

  function applyHex(raw) {
    setHexInput(raw);
    const parsed = hexToRgb(raw);
    if (parsed) {
      setRgb(parsed);
      setCmy(rgbToCmy(parsed));
      onChange(rgbToHex(parsed));
    }
  }

  function applyRgb(next) {
    setRgb(next);
    const h = rgbToHex(next);
    setHexInput(h);
    setCmy(rgbToCmy(next));
    onChange(h);
  }

  function applyCmy(next) {
    setCmy(next);
    const converted = cmyToRgb(next);
    setRgb(converted);
    const h = rgbToHex(converted);
    setHexInput(h);
    onChange(h);
  }

  const previewStyle = hex ? { background: hex } : { background: '#ccc' };

  return (
    <div className="color-picker">
      <div className="color-picker-preview" style={previewStyle} />
      <div className="color-picker-fields">
        <label>Hex
          <input
            value={hexInput}
            onChange={e => applyHex(e.target.value)}
            placeholder="#rrggbb"
            maxLength={7}
          />
        </label>
        <label>R <input type="number" min="0" max="255" value={rgb.r} onChange={e => applyRgb({ ...rgb, r: +e.target.value })} /></label>
        <label>G <input type="number" min="0" max="255" value={rgb.g} onChange={e => applyRgb({ ...rgb, g: +e.target.value })} /></label>
        <label>B <input type="number" min="0" max="255" value={rgb.b} onChange={e => applyRgb({ ...rgb, b: +e.target.value })} /></label>
        <label>C <input type="number" min="0" max="100" value={Math.round(cmy.c)} onChange={e => applyCmy({ ...cmy, c: +e.target.value })} /></label>
        <label>M <input type="number" min="0" max="100" value={Math.round(cmy.m)} onChange={e => applyCmy({ ...cmy, m: +e.target.value })} /></label>
        <label>Y <input type="number" min="0" max="100" value={Math.round(cmy.y)} onChange={e => applyCmy({ ...cmy, y: +e.target.value })} /></label>
        <button className="color-picker-clear" onClick={() => onChange(null)}>Clear swatch</button>
      </div>
    </div>
  );
}
