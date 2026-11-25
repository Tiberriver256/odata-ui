/**
 * Explicit sketch for an Angular standalone component wrapper around `@odata-ui/core`.
 * Not compiled as part of the workspace until an Angular package build is needed.
 */
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { mount, type ODataUIInstance, type ODataUIOptions } from '@odata-ui/core';

@Component({
  selector: 'odata-ui',
  standalone: true,
  template: `<div #host style="height: 100%; width: 100%;"></div>`,
})
export class ODataUIComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  @Input() url?: string;
  @Input() metadata?: string;
  @Input() headers?: ODataUIOptions['headers'];
  @Input() requestInterceptor?: ODataUIOptions['requestInterceptor'];
  @Input() theme?: ODataUIOptions['theme'];

  private instance?: ODataUIInstance;

  ngAfterViewInit(): void {
    this.instance = mount(this.host.nativeElement, {
      url: this.url,
      metadata: this.metadata,
      headers: this.headers,
      requestInterceptor: this.requestInterceptor,
      theme: this.theme,
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.instance) return;
    if (changes['url'] && this.url) {
      void this.instance.setUrl(this.url);
    }
    if (changes['metadata'] && this.metadata) {
      this.instance.loadMetadata(this.metadata);
    }
  }

  ngOnDestroy(): void {
    this.instance?.unmount();
  }
}
