import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBlankOrderConfig, computeBlankPlan } from '../api/blankOrder';
import BlankOrderParams from './BlankOrderParams';
import BlankOrderTable from './BlankOrderTable';

export default function BlankOrderFlow() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState(null);
  const [params, setParams] = useState(null);
  const [error, setError] = useState(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    getBlankOrderConfig().then(setCfg).catch(e => setError(e.message));
  }, []);

  async function handleCompute(p) {
    setComputing(true);
    setError(null);
    try {
      const result = await computeBlankPlan({
        csvOld: p.csvOld, csvNew: p.csvNew,
        grandTotal: p.grandTotal, perTypeTotals: p.perTypeTotals,
        perTypeSizeRestrictions: p.perTypeSizeRestrictions,
        policyOverrides: p.policyOverrides,
      });
      setParams(p);
      setPlan(result);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  }

  if (!cfg) return <div className="blank-order-flow">{error ? <div className="error-banner">{error}</div> : 'Loading…'}</div>;

  return (
    <div className="blank-order-flow">
      <button onClick={() => navigate('/orders')}>← Back to orders</button>
      {error && <div className="error-banner">{error}</div>}
      {step === 1 && (
        <BlankOrderParams
          config={cfg.config}
          stockBlankItems={cfg.stockBlankItems}
          onCompute={handleCompute}
        />
      )}
      {step === 2 && plan && (
        <BlankOrderTable
          plan={plan}
          styleItemTypeMap={params.styleItemTypeMap}
          onBack={() => setStep(1)}
        />
      )}
      {computing && <div className="computing">Computing…</div>}
    </div>
  );
}
