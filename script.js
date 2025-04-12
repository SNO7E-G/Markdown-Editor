// Initialize marked with options
marked.use({
    mangle: false,
    headerIds: true,
    gfm: true,
    breaks: true,
    pedantic: false,
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
});

class MarkdownEditor {
    constructor() {
        // Create modal overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'modal-overlay';
        document.body.appendChild(this.modalOverlay);

        this.createTableDialog();
        this.initialize();
        this.setupEventListeners();
        this.loadSavedContent();
        
        // Initial render
        this.updatePreview();
        this.adjustTextareaHeight();
    }

    initialize() {
        // DOM elements
        this.editor = document.getElementById('markdownInput');
        this.preview = document.getElementById('preview');
        this.wordCount = document.querySelector('.word-count');
        this.saveStatus = document.querySelector('.save-status');
        this.cheatSheet = document.querySelector('.cheat-sheet');
        this.notifications = document.getElementById('notifications');
        this.helpButton = document.getElementById('toggleCheatSheet');
        this.modalOverlay.hidden = true;
        this.tableDialog = document.getElementById('tableDialog');

        // State
        this.saveTimeout = null;
        this.lastSavedContent = '';
        this.darkMode = localStorage.getItem('darkMode') === 'true';
        
        // Initialize theme
        this.updateTheme();

        // Initialize marked with custom options
        marked.setOptions({
            gfm: true,
            breaks: true,
            highlight: (code, language) => {
                if (Prism.languages[language]) {
                    return Prism.highlight(code, Prism.languages[language], language);
                }
                return code;
            }
        });
    }

    createTableDialog() {
        // Create table dialog
        const dialog = document.createElement('div');
        dialog.id = 'tableDialog';
        dialog.className = 'modal-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Create Table</h3>
                <div class="dialog-body">
                    <div class="input-group">
                        <label for="rowCount">Number of Rows:</label>
                        <input type="number" id="rowCount" min="1" value="3">
                    </div>
                    <div class="input-group">
                        <label for="colCount">Number of Columns:</label>
                        <input type="number" id="colCount" min="1" value="3">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn" id="cancelTable">Cancel</button>
                    <button class="btn btn-primary" id="createTable">Create</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    showTableDialog() {
        if (!this.tableDialog) return;
        
        this.tableDialog.style.display = 'block';
        this.modalOverlay.hidden = false;
        
        // Focus on the row input
        const rowInput = document.getElementById('rowCount');
        if (rowInput) rowInput.focus();
    }

    hideTableDialog() {
        if (!this.tableDialog) return;
        
        this.tableDialog.style.display = 'none';
        this.modalOverlay.hidden = true;
    }

    handleTableOperation(operation, event) {
        event?.preventDefault();
        
        switch (operation) {
            case 'table':
                this.showTableDialog();
                break;
            case 'table-row':
                this.addTableRow();
                break;
            case 'table-column':
                this.addTableColumn();
                break;
            case 'table-delete-row':
                this.deleteTableRow();
                break;
            case 'table-delete-column':
                this.deleteTableColumn();
                break;
        }
    }

    setupEventListeners() {
        // Editor events
        this.editor.addEventListener('input', this.handleInput.bind(this));
        this.editor.addEventListener('keydown', this.handleKeydown.bind(this));

        // Toolbar button events
        document.querySelectorAll('.toolbar .btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleToolbarAction(e));
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.darkMode = !this.darkMode;
            localStorage.setItem('darkMode', this.darkMode);
            this.updateTheme();
        });

        // Enhanced help sheet toggle functionality
        this.helpButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleHelpWindow();
        });

        document.getElementById('closeCheatSheet').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideCheatSheet();
        });

        // Close cheat sheet when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.cheatSheet.contains(e.target) && 
                !this.helpButton.contains(e.target) &&
                !this.cheatSheet.hidden) {
                this.toggleHelpWindow();
            }
        });

        // Close help window with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.cheatSheet.hidden) {
                this.toggleHelpWindow();
            }
        });

        // File operations
        document.getElementById('importFile').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        document.getElementById('fileInput').addEventListener('change', this.handleFileImport.bind(this));
        document.getElementById('exportMarkdown').addEventListener('click', () => this.exportFile('md'));
        document.getElementById('exportHtml').addEventListener('click', () => this.exportFile('html'));

        // Copy operations
        document.getElementById('copyMarkdown').addEventListener('click', () => this.copyToClipboard('markdown'));
        document.getElementById('copyHtml').addEventListener('click', () => this.copyToClipboard('html'));

        // Preview actions
        document.getElementById('refreshPreview').addEventListener('click', () => this.updatePreview());
        document.getElementById('printPreview').addEventListener('click', () => window.print());
        document.getElementById('zoomPreview').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isFullscreen = btn.getAttribute('aria-pressed') === 'true';
            btn.setAttribute('aria-pressed', !isFullscreen);
            document.querySelector('.editor-container').style.gridTemplateColumns = 
                isFullscreen ? '1fr 1fr' : '0 1fr';
        });

        // Clear input
        document.getElementById('clearInput').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all content?')) {
                this.editor.value = '';
                this.updatePreview();
                this.saveToLocalStorage();
            }
        });

        // Generate TOC
        document.getElementById('generateToc').addEventListener('click', () => this.generateTableOfContents());

        // Help button functionality
        this.modalOverlay.addEventListener('click', () => this.toggleHelpWindow());

        // Auto-resize textarea
        this.editor.addEventListener('input', () => this.adjustTextareaHeight());

        // Update table operation event listeners
        document.querySelectorAll('.table-tools .btn').forEach(btn => {
            const format = btn.dataset.format;
            if (format && format.startsWith('table')) {
                btn.addEventListener('click', (e) => this.handleTableOperation(format, e));
            }
        });

        // Table dialog event listeners
        document.getElementById('cancelTable')?.addEventListener('click', () => this.hideTableDialog());
        document.getElementById('createTable')?.addEventListener('click', () => {
            const rows = parseInt(document.getElementById('rowCount').value) || 3;
            const cols = parseInt(document.getElementById('colCount').value) || 3;
            this.createTable(rows, cols);
            this.hideTableDialog();
        });

        // Handle Escape key for table dialog
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.tableDialog && this.tableDialog.style.display === 'block') {
                this.hideTableDialog();
            }
        });

        // Close table dialog when clicking outside
        this.modalOverlay.addEventListener('click', (e) => {
            if (this.tableDialog && this.tableDialog.style.display === 'block') {
                this.hideTableDialog();
            }
        });
    }

    handleInput() {
        this.updatePreview();
        this.updateWordCount();
        this.scheduleSave();
    }

    handleKeydown(e) {
        // Handle keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    this.insertMarkdown('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    this.insertMarkdown('italic');
                    break;
                case 'k':
                    e.preventDefault();
                    this.insertMarkdown(e.shiftKey ? 'image' : 'link');
                    break;
                case 's':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.saveToFile();
                    }
                    break;
            }
        }
        // Handle tab key for indentation
        if (e.key === 'Tab') {
            e.preventDefault();
            this.insertAtCursor('    ');
        }
    }

    handleToolbarAction(e) {
        const format = e.currentTarget.dataset.format;
        if (format) {
            this.insertMarkdown(format);
        }
    }

    insertMarkdown(type) {
        const formats = {
            bold: { wrap: '**', placeholder: 'bold text' },
            italic: { wrap: '_', placeholder: 'italic text' },
            strike: { wrap: '~~', placeholder: 'strikethrough text' },
            code: { wrap: '`', placeholder: 'code' },
            h1: { start: '# ', placeholder: 'Heading 1' },
            h2: { start: '## ', placeholder: 'Heading 2' },
            h3: { start: '### ', placeholder: 'Heading 3' },
            ul: { start: '- ', placeholder: 'List item' },
            ol: { start: '1. ', placeholder: 'List item' },
            task: { start: '- [ ] ', placeholder: 'Task item' },
            quote: { start: '> ', placeholder: 'Quote' },
            hr: { insert: '\n---\n' },
            link: { template: '[${text}](${url})', placeholders: { text: 'link text', url: 'URL' } },
            image: { template: '![${alt}](${url})', placeholders: { alt: 'alt text', url: 'image URL' } },
            table: { action: () => this.showTableDialog() },
            'table-row': { action: () => this.addTableRow() },
            'table-column': { action: () => this.addTableColumn() },
            'table-delete-row': { action: () => this.deleteTableRow() },
            'table-delete-column': { action: () => this.deleteTableColumn() }
        };

        if (!formats[type]) {
            console.warn(`Unknown format type: ${type}`);
            return;
        }

        const format = formats[type];
        if (format.action) {
            format.action();
            return;
        }

        const { selectionStart, selectionEnd } = this.editor;
        const selectedText = this.editor.value.substring(selectionStart, selectionEnd);

        let insertion = '';
        try {
            if (format.wrap) {
                insertion = format.wrap + (selectedText || format.placeholder) + format.wrap;
            } else if (format.start) {
                insertion = format.start + (selectedText || format.placeholder);
            } else if (format.template) {
                if (selectedText) {
                    insertion = format.template.replace('${text}', selectedText)
                        .replace('${url}', 'URL')
                        .replace('${alt}', 'alt text');
                } else {
                    const placeholders = Object.entries(format.placeholders)
                        .map(([key, value]) => prompt(`Enter ${value}:`) || value);
                    insertion = format.template
                        .replace(/\${[^}]+}/g, () => placeholders.shift());
                }
            } else if (format.insert) {
                insertion = format.insert;
            }

            this.insertAtCursor(insertion);
            this.editor.focus();
        } catch (error) {
            console.error('Error inserting markdown:', error);
            this.showNotification('Error inserting markdown format', 'error');
        }
    }

    insertAtCursor(text, skipInput = false) {
        const { selectionStart, selectionEnd } = this.editor;
        this.editor.value = 
            this.editor.value.substring(0, selectionStart) +
            text +
            this.editor.value.substring(selectionEnd);
        
        const newCursorPos = selectionStart + text.length;
        this.editor.setSelectionRange(newCursorPos, newCursorPos);
        
        // Only handle input if not skipped (for table operations)
        if (!skipInput) {
            this.handleInput();
        }
    }

    updatePreview() {
        const content = this.editor.value;
        try {
            this.preview.innerHTML = marked.parse(content);
            hljs.highlightAll();
        } catch (error) {
            console.error('Error parsing markdown:', error);
            this.showNotification('Error parsing markdown', 'error');
        }
    }

    updateWordCount() {
        const words = this.editor.value.trim()
            .split(/\s+/)
            .filter(word => word.length > 0).length;
        this.wordCount.textContent = `Words: ${words}`;
    }

    scheduleSave() {
        this.saveStatus.textContent = 'Saving...';
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToLocalStorage(), 1000);
    }

    saveToLocalStorage() {
        const content = this.editor.value;
        if (content !== this.lastSavedContent) {
            localStorage.setItem('markdownContent', content);
            this.lastSavedContent = content;
            this.saveStatus.textContent = 'Saved ✓';
            setTimeout(() => {
                if (this.saveStatus.textContent === 'Saved ✓') {
                    this.saveStatus.textContent = '';
                }
            }, 2000);
        }
    }

    loadSavedContent() {
        const savedContent = localStorage.getItem('markdownContent');
        if (savedContent) {
            this.editor.value = savedContent;
            this.handleInput();
        }
    }

    async handleFileImport(e) {
        const file = e.target.files[0];
        if (file) {
            try {
                const content = await file.text();
                this.editor.value = content;
                this.handleInput();
                this.showNotification('File imported successfully!', 'success');
            } catch (error) {
                this.showNotification('Error importing file', 'error');
            }
        }
    }

    exportFile(type) {
        const content = type === 'html' ? 
            this.preview.innerHTML :
            this.editor.value;
        
        const blob = new Blob([content], { type: `text/${type}` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document.${type}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async copyToClipboard(type) {
        const content = type === 'html' ? 
            this.preview.innerHTML :
            this.editor.value;
        
        try {
            await navigator.clipboard.writeText(content);
            this.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} copied to clipboard!`, 'success');
        } catch (error) {
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }

    generateTableOfContents() {
        const headings = this.editor.value.match(/^#{1,3}\s+.+$/gm) || [];
        if (headings.length === 0) {
            this.showNotification('No headings found in the document', 'info');
            return;
        }

        let toc = '\n## Table of Contents\n\n';
        headings.forEach(heading => {
            const level = heading.match(/^#{1,3}/)[0].length;
            const text = heading.replace(/^#{1,3}\s+/, '');
            const link = text.toLowerCase().replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            const indent = '  '.repeat(level - 1);
            toc += `${indent}- [${text}](#${link})\n`;
        });

        this.insertAtCursor(toc + '\n');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        this.notifications.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    updateTheme() {
        document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
        document.getElementById('themeToggle').querySelector('.theme-icon').textContent = 
            this.darkMode ? '🌜' : '🌞';
    }

    toggleCheatSheet() {
        this.cheatSheet.hidden = !this.cheatSheet.hidden;
        const button = document.getElementById('toggleCheatSheet');
        button.setAttribute('aria-expanded', (!this.cheatSheet.hidden).toString());
    }

    hideCheatSheet() {
        if (!this.cheatSheet.hidden) {
            this.cheatSheet.hidden = true;
            this.modalOverlay.hidden = true;
            this.helpButton.setAttribute('aria-expanded', 'false');
        }
    }

    toggleHelpWindow() {
        const isHidden = this.cheatSheet.hidden;
        this.cheatSheet.hidden = !isHidden;
        this.modalOverlay.hidden = !isHidden;
        this.helpButton.setAttribute('aria-expanded', (!isHidden).toString());
    }

    adjustTextareaHeight() {
        this.editor.style.height = 'auto';
        this.editor.style.height = this.editor.scrollHeight + 'px';
    }

    createTable(rows = 3, cols = 3) {
        const headers = Array(cols).fill('').map((_, i) => ` Header ${i + 1} `).join('|');
        const separator = Array(cols).fill(' -------- ').join('|');
        const cells = Array(rows).fill(Array(cols).fill(' Cell ').join('|')).join('\n|');
        const table = `\n|${headers}|\n|${separator}|\n|${cells}|\n`;
        this.insertAtCursor(table);
        this.updatePreview();
    }

    findTableBoundaries(lines, currentLine) {
        let tableStart = currentLine;
        let tableEnd = currentLine;
        
        // Search backwards for table start
        while (tableStart > 0 && lines[tableStart - 1] && lines[tableStart - 1].trim().startsWith('|')) {
            tableStart--;
        }
        
        // Search forwards for table end
        while (tableEnd < lines.length && lines[tableEnd] && lines[tableEnd].trim().startsWith('|')) {
            tableEnd++;
        }
        
        return { start: tableStart, end: tableEnd - 1 };
    }

    isInsideTable(text, position) {
        const lines = text.split('\n');
        let currentLine = 0;
        let totalLength = 0;
        
        // Find the current line
        while (currentLine < lines.length && totalLength + lines[currentLine].length + 1 <= position) {
            totalLength += lines[currentLine].length + 1;
            currentLine++;
        }
        
        if (currentLine >= lines.length) return false;
        
        const line = lines[currentLine];
        // Check if line is part of a table
        if (!line.trim().startsWith('|')) return false;
        
        // Get table boundaries and verify we're in a valid table
        const { start, end } = this.findTableBoundaries(lines, currentLine);
        if (end - start < 2) return false; // Need at least header, separator, and one data row
        
        return true;
    }

    getTableColumns(line) {
        // Remove empty cells at the start and end
        const cells = line.split('|').filter(cell => cell.trim().length > 0);
        return cells.length;
    }

    addTableRow() {
        const text = this.editor.value;
        const position = this.editor.selectionStart;
        
        if (!this.isInsideTable(text, position)) {
            this.showNotification('Please place cursor inside a table', 'error');
            return;
        }
        
        const lines = text.split('\n');
        let currentLine = 0;
        let totalLength = 0;
        
        // Find current line
        while (totalLength + lines[currentLine].length + 1 <= position) {
            totalLength += lines[currentLine].length + 1;
            currentLine++;
        }
        
        // Get table boundaries
        const { start } = this.findTableBoundaries(lines, currentLine);
        
        // Get number of columns from the header row
        const columnCount = this.getTableColumns(lines[start]);
        
        // Create new row with the correct number of columns
        const newRow = '\n|' + ' Cell |'.repeat(columnCount);
        
        // Insert row after current position, skip handleInput as we'll update manually
        this.insertAtCursor(newRow, true);
        this.updatePreview();
        this.updateWordCount();
        this.scheduleSave();
    }

    addTableColumn() {
        const text = this.editor.value;
        const position = this.editor.selectionStart;
        
        if (!this.isInsideTable(text, position)) {
            this.showNotification('Please place cursor inside a table', 'error');
            return;
        }
        
        const lines = text.split('\n');
        let currentLine = 0;
        let totalLength = 0;
        
        // Find current line
        while (totalLength + lines[currentLine].length + 1 <= position) {
            totalLength += lines[currentLine].length + 1;
            currentLine++;
        }
        
        // Get table boundaries and cursor position
        const { start, end } = this.findTableBoundaries(lines, currentLine);
        const posInLine = position - totalLength;
        
        // Find target column based on cursor position
        const cells = lines[currentLine].split('|');
        let targetColumn = 0;
        let pos = 0;
        for (let i = 0; i < cells.length; i++) {
            pos += cells[i].length + 1;
            if (pos >= posInLine) {
                targetColumn = i;
                break;
            }
        }
        
        // Insert new column in each row
        for (let i = start; i <= end; i++) {
            const cells = lines[i].split('|');
            const newCell = i === start + 1 ? ' -------- ' : ' Cell ';
            cells.splice(targetColumn + 1, 0, newCell);
            lines[i] = cells.join('|');
        }
        
        // Update content and manually trigger updates
        this.editor.value = lines.join('\n');
        this.editor.setSelectionRange(position, position);
        this.updatePreview();
        this.updateWordCount();
        this.scheduleSave();
    }

    deleteTableRow() {
        const text = this.editor.value;
        const position = this.editor.selectionStart;
        
        if (!this.isInsideTable(text, position)) {
            this.showNotification('Please place cursor inside a table', 'error');
            return;
        }
        
        const lines = text.split('\n');
        let currentLine = 0;
        let totalLength = 0;
        
        // Find current line
        while (totalLength + lines[currentLine].length + 1 <= position) {
            totalLength += lines[currentLine].length + 1;
            currentLine++;
        }
        
        // Get table boundaries
        const { start, end } = this.findTableBoundaries(lines, currentLine);
        
        // Don't delete header or separator
        if (currentLine <= start + 1) {
            this.showNotification('Cannot delete header or separator row', 'error');
            return;
        }
        
        // Check if this would leave the table with no data rows
        if (end - start <= 2) {
            this.showNotification('Cannot delete the last data row', 'error');
            return;
        }
        
        // Remove the current row
        lines.splice(currentLine, 1);
        this.editor.value = lines.join('\n');
        this.updatePreview();
        
        // Move cursor to the next row or previous row if at the end
        const newPosition = totalLength;
        this.editor.setSelectionRange(newPosition, newPosition);
    }

    deleteTableColumn() {
        const text = this.editor.value;
        const position = this.editor.selectionStart;
        
        if (!this.isInsideTable(text, position)) {
            this.showNotification('Please place cursor inside a table', 'error');
            return;
        }
        
        const lines = text.split('\n');
        let currentLine = 0;
        let totalLength = 0;
        
        // Find current line and column
        while (totalLength + lines[currentLine].length + 1 <= position) {
            totalLength += lines[currentLine].length + 1;
            currentLine++;
        }
        
        const posInLine = position - totalLength;
        let targetColumn = 0;
        let pos = 0;
        
        // Find the column to delete based on cursor position
        const cells = lines[currentLine].split('|');
        for (let i = 0; i < cells.length; i++) {
            pos += cells[i].length + 1;
            if (pos >= posInLine) {
                targetColumn = i;
                break;
            }
        }
        
        // Get table boundaries
        const { start, end } = this.findTableBoundaries(lines, currentLine);
        
        // Don't delete if it would result in an empty table
        if (this.getTableColumns(lines[start]) <= 2) {
            this.showNotification('Cannot delete the last column', 'error');
            return;
        }
        
        // Delete the column from each row
        for (let i = start; i <= end; i++) {
            const cells = lines[i].split('|');
            if (targetColumn < cells.length) {
                cells.splice(targetColumn, 1);
                lines[i] = cells.join('|');
            }
        }
        
        // Update editor content
        const newContent = lines.join('\n');
        const selectionStart = this.editor.selectionStart;
        this.editor.value = newContent;
        this.editor.setSelectionRange(selectionStart, selectionStart);
        this.updatePreview();
    }
}

// Initialize the editor when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MarkdownEditor();
});