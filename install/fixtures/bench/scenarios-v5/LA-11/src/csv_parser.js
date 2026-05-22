class CSVParser {
  constructor() {
    this.state = 'START';
    this.currentField = '';
    this.currentRow = [];
    this.rows = [];
  }

  parse(char) {
    switch(this.state) {
      case 'START':
        if (char === '"') {
          this.state = 'IN_QUOTED';
        } else if (char === ',') {
          this.state = 'START';  // BUG: Should add field and reset
        } else {
          this.currentField += char;
        }
        break;
      case 'IN_QUOTED':
        if (char === '"') {
          this.state = 'AFTER_QUOTE';
        } else {
          this.currentField += char;
        }
        break;
      case 'AFTER_QUOTE':
        if (char === '"') {
          this.currentField += '"';
          this.state = 'IN_QUOTED';  // BUG: Invalid transition
        } else if (char === ',') {
          this.currentRow.push(this.currentField);
          this.currentField = '';
          this.state = 'START';
        }
        break;
    }
  }
}