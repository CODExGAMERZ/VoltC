#include <stdio.h>

int main() {
    int score = 95;
    int *score_ptr = &score;
    
    printf("--- VoltC Memory Visualization Demo ---\n");
    printf("Variable score value: %d\n", score);
    printf("Address of score (&score): %p\n", (void*)&score);
    
    printf("\nPointer score_ptr points to: %p\n", (void*)score_ptr);
    printf("Dereferenced score_ptr (*score_ptr): %d\n", *score_ptr);
    
    // Modifying value via pointer
    *score_ptr = 100;
    printf("\nModified score value: %d\n", score);
    
    return 0;
}
