export function setupCanvas(appEl) {
    appEl.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'game';
    appEl.appendChild(canvas);
  
    const ctx = canvas.getContext('2d', { alpha: false });
  
    let dpr = Math.max(1, window.devicePixelRatio || 1);
  
    function resize() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    }
  
    window.addEventListener('resize', resize);
    resize();
  
    return {
      canvas,
      ctx,
      getDpr: () => dpr,
      resize,
    };
  }
  