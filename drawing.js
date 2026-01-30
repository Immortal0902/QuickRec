class DrawingEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.offscreenCanvas = document.createElement('canvas');
        this.offCtx = this.offscreenCanvas.getContext('2d');

        this.isDrawing = false;
        this.paths = []; // Array of { points: [], color, width, mode }
        this.currentPath = null;
        this.color = '#ef4444'; // default red
        this.lineWidth = 5;
        this.enabled = false;
        this.mode = 'path'; // 'path', 'text', 'eraser'

        this.setupEvents();
    }

    setTool(tool) {
        if (tool === 'pen') {
            this.mode = 'path';
            this.color = '#ef4444';
            this.lineWidth = 5;
        } else if (tool === 'marker') {
            this.mode = 'path';
            this.color = 'rgba(255, 255, 0, 0.5)'; // Highlighter
            this.lineWidth = 20;
        } else if (tool === 'eraser') {
            this.mode = 'eraser';
            this.lineWidth = 30;
        } else if (tool === 'text') {
            this.mode = 'text';
        }
    }

    async addTextPrompt(x, y) {
        if (!this.enabled) return;
        // Small delay to prevent blocking before mouseup
        setTimeout(() => {
            const text = prompt("Enter text to add:");
            if (text) {
                this.paths.push({
                    type: 'text',
                    text: text,
                    x: x,
                    y: y,
                    color: this.color,
                    font: "30px Arial"
                });
            }
        }, 50);
    }

    setupEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.enabled) return;

            if (this.mode === 'text') {
                const pos = getPos(e);
                this.addTextPrompt(pos.x, pos.y);
                return;
            }

            this.isDrawing = true;
            const pos = getPos(e);

            // For eraser, we use a specific type or composite mode
            this.currentPath = {
                type: this.mode === 'eraser' ? 'eraser' : 'path',
                points: [pos],
                color: this.color,
                width: this.lineWidth
            };
            this.paths.push(this.currentPath);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing || !this.enabled || this.mode === 'text') return;
            const pos = getPos(e);
            this.currentPath.points.push(pos);
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDrawing = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDrawing = false;
        });
    }

    clear() {
        this.paths = [];
    }

    draw(ctx) {
        if (this.paths.length === 0) return;

        // Ensure offscreen matches main size
        if (this.offscreenCanvas.width !== ctx.canvas.width || this.offscreenCanvas.height !== ctx.canvas.height) {
            this.offscreenCanvas.width = ctx.canvas.width;
            this.offscreenCanvas.height = ctx.canvas.height;
        }

        const oCtx = this.offCtx;
        oCtx.clearRect(0, 0, oCtx.canvas.width, oCtx.canvas.height);

        oCtx.lineCap = 'round';
        oCtx.lineJoin = 'round';

        this.paths.forEach(path => {
            oCtx.save();

            if (path.type === 'eraser') {
                oCtx.globalCompositeOperation = 'destination-out';
            } else {
                oCtx.globalCompositeOperation = 'source-over';
            }

            // Text Rendering
            if (path.type === 'text') {
                oCtx.fillStyle = path.color;
                oCtx.font = path.font || "30px Arial";
                oCtx.fillText(path.text, path.x, path.y);
            }
            // Path Rendering
            else if (path.points && path.points.length > 0) {
                oCtx.beginPath();
                oCtx.strokeStyle = path.color;
                oCtx.lineWidth = path.width;
                oCtx.moveTo(path.points[0].x, path.points[0].y);

                for (let i = 1; i < path.points.length; i++) {
                    oCtx.lineTo(path.points[i].x, path.points[i].y);
                }
                oCtx.stroke();
            }
            oCtx.restore();
        });

        // Blit offscreen to main
        ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
}
