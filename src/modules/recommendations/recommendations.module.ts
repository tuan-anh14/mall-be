import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { ViewHistoryModule } from '../view-history/view-history.module';

@Module({
  imports: [
    HttpModule,
    ViewHistoryModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
