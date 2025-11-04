import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService } from './services/gemini.service';
import { Message } from './models/chat.model';

type AppState = 'initial' | 'awaiting_options' | 'awaiting_analysis_criteria' | 'awaiting_competitor_menu' | 'awaiting_comparison_keywords';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .chat-container {
        scrollbar-width: thin;
        scrollbar-color: #4a5568 #2d3748;
    }
  `
})
export class AppComponent {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  
  private geminiService = inject(GeminiService);

  userInput = signal('');
  isLoading = signal(false);
  messages = signal<Message[]>([]);
  
  appState = signal<AppState>('initial');
  userMenu = signal<string | null>(null);
  
  isInputDisabled = computed(() => this.isLoading() || this.appState() === 'awaiting_options');

  constructor() {
    this.addAiMessage("Pozdrav! Ja sam GastroAnalitičar, vaš AI asistent za optimizaciju menija. Molim vas, unesite svoj menu – možete zalijepiti tekst ili priložiti sliku.", []);
    
    effect(() => {
        // Auto-scroll logic
        if (this.messages() && this.chatContainer) {
            setTimeout(() => {
                const element = this.chatContainer.nativeElement;
                element.scrollTop = element.scrollHeight;
            }, 0);
        }
    });
  }

  private addMessage(role: 'user' | 'ai', content: string, options: string[] = []) {
    this.messages.update(current => [...current, { role, content, options, timestamp: new Date() }]);
  }

  private addUserMessage(content: string) {
    this.addMessage('user', content);
    this.userInput.set('');
  }

  private addAiMessage(content: string, options: string[] = []) {
    this.addMessage('ai', content, options);
  }

  async handleOptionClick(option: string) {
    if (this.isLoading()) return;
    
    this.addUserMessage(option);
    this.isLoading.set(true);

    if (this.appState() === 'awaiting_options') {
        if (option === 'Analizirati ovaj menu.') {
            this.appState.set('awaiting_analysis_criteria');
            this.addAiMessage("Kako želite analizirati svoj menu? Tražimo li po ključnim riječima, cjenovnom rangu, vrsti jela ili specifičnoj temi (npr. 'bez glutena')?");
        } else if (option === 'Usporediti ovaj menu s drugim.') {
            this.appState.set('awaiting_competitor_menu');
            this.addAiMessage("Molim unesite konkurentski menu (tekst ili slika).");
        }
    }
    this.isLoading.set(false);
  }

  async handleSend() {
    const text = this.userInput().trim();
    if (!text || this.isLoading()) return;

    this.addUserMessage(text);
    this.isLoading.set(true);

    try {
        switch(this.appState()) {
            case 'initial':
                const structuredMenu = await this.geminiService.structureMenuFromText(text);
                this.userMenu.set(structuredMenu);
                this.addAiMessage("Hvala. Obradio sam vaš menu i sada je strukturiran. Što želite učiniti?", ["Analizirati ovaj menu.", "Usporediti ovaj menu s drugim."]);
                this.appState.set('awaiting_options');
                break;
            case 'awaiting_analysis_criteria':
                const analysis = await this.geminiService.analyzeMenu(this.userMenu()!, text);
                this.addAiMessage(analysis);
                this.resetFlow();
                break;
            case 'awaiting_competitor_menu':
                const competitorMenu = await this.geminiService.structureMenuFromText(text);
                this.addAiMessage("Konkurentski menu je obrađen. Imate li specifične ključne riječi na koje se želite fokusirati prilikom usporedbe (npr. 'cijene tjestenina', 'ponuda doručka', 'premium sastojci')? Ako ne, samo recite 'Ne' ili 'Preskoči' za opću usporedbu.");
                this.appState.set('awaiting_comparison_keywords');
                // Store competitor menu temporarily in a different way or pass directly
                (window as any).competitorMenu = competitorMenu; 
                break;
            case 'awaiting_comparison_keywords':
                const tempCompetitorMenu = (window as any).competitorMenu;
                const keywords = text.toLowerCase() === 'ne' || text.toLowerCase() === 'preskoči' ? null : text;
                const comparison = await this.geminiService.compareMenus(this.userMenu()!, tempCompetitorMenu, keywords);
                this.addAiMessage(comparison);
                delete (window as any).competitorMenu;
                this.resetFlow();
                break;
        }
    } catch (error) {
        console.error('API Error:', error);
        this.addAiMessage("Došlo je do pogreške. Molim pokušajte ponovno.");
    } finally {
        this.isLoading.set(false);
    }
  }

  async handleImageUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.addUserMessage(`Slika priložena: ${file.name}`);
    this.isLoading.set(true);

    try {
        if (this.appState() === 'initial' || this.appState() === 'awaiting_competitor_menu') {
            const structuredMenu = await this.geminiService.structureMenuFromImage(file);
            
            if (this.appState() === 'initial') {
                this.userMenu.set(structuredMenu);
                this.addAiMessage("Hvala. Obradio sam vaš menu sa slike i sada je strukturiran. Što želite učiniti?", ["Analizirati ovaj menu.", "Usporediti ovaj menu s drugim."]);
                this.appState.set('awaiting_options');
            } else { // awaiting_competitor_menu
                 this.addAiMessage("Konkurentski menu sa slike je obrađen. Imate li specifične ključne riječi na koje se želite fokusirati prilikom usporedbe (npr. 'cijene tjestenina', 'ponuda doručka', 'premium sastojci')? Ako ne, samo recite 'Ne' ili 'Preskoči' za opću usporedbu.");
                this.appState.set('awaiting_comparison_keywords');
                (window as any).competitorMenu = structuredMenu;
            }
        }
    } catch (error) {
        console.error('API Error:', error);
        this.addAiMessage("Došlo je do pogreške prilikom obrade slike. Molim pokušajte ponovno.");
    } finally {
        this.isLoading.set(false);
        input.value = ''; // Reset file input
    }
  }

  private resetFlow() {
      this.appState.set('initial');
      this.userMenu.set(null);
      setTimeout(() => {
        this.addAiMessage("Spreman sam za novi zadatak. Unesite novi menu za analizu.");
      }, 1000);
  }

  // A simple markdown to HTML converter for display
  parseMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>'); // List items
  }
}
